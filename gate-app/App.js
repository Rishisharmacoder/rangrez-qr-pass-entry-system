import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ScrollView, StyleSheet } from 'react-native';
import { NavigationContainer, DarkTheme, useIsFocused } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_KEY, APP_KEY } from './config';

const C = { ink: '#16112A', card: '#241C3D', line: '#3A2F5C', text: '#F7F2FF', dim: '#A89CC8', gold: '#F5A524', ok: '#12894A', okText: '#6EE7A1', no: '#C62E3A', warn: '#B7791F' };
const Ctx = createContext(null);
const Tab = createBottomTabNavigator();

const fmt = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');
const ago = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : fmt(iso);
};
const ini = (n) => n.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Calls a Supabase SQL function. Never throws: network problems return {ok:false, reason:'NETWORK'}.
async function rpc(fn, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return { ok: false, reason: 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}

const Btn = ({ label, onPress, small, quiet }) => (
  <Pressable onPress={onPress} style={[st.btn, small && st.btnSm, quiet && st.btnQuiet]}>
    <Text style={[st.btnText, quiet && { color: C.text }]}>{label}</Text>
  </Pressable>
);

function Head({ title, right, onLong }) {
  const { top } = useSafeAreaInsets();
  return (
    <Pressable onLongPress={onLong} delayLongPress={2500} style={[st.head, { paddingTop: top + 8 }]}>
      <Text style={st.title}>{title}</Text>
      {right}
    </Pressable>
  );
}

function Row({ s, onMark, when }) {
  return (
    <View style={st.row}>
      <View style={st.av}><Text style={st.avText}>{ini(s.name)}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={st.rname}>{s.name}</Text>
        <Text style={st.dim}>{s.uid}{s.course ? `, ${s.course}` : ''}</Text>
      </View>
      {s.entered ? <Text style={st.in}>{when ? ago(s.entered_at) : fmt(s.entered_at)}</Text>
        : onMark ? <Btn small label="Mark entry" onPress={onMark} /> : <Text style={st.left}>Left</Text>}
    </View>
  );
}

// ---------- HOME ----------
function Home({ navigation }) {
  const { roster, online, setWalk, setAdmin } = useContext(Ctx);
  const total = roster.length;
  const entered = roster.filter((s) => s.entered);
  const inside = entered.length;
  const R = 42, CIR = 2 * Math.PI * R;
  const latest = [...entered].sort((a, b) => new Date(b.entered_at) - new Date(a.entered_at)).slice(0, 6);
  return (
    <View style={{ flex: 1 }}>
      <Head title="Rangrez 3.0" onLong={() => setAdmin(true)}
        right={<View style={st.live}><View style={[st.dot, { backgroundColor: online ? C.okText : C.gold }]} /><Text style={st.dim}>{online ? 'Live' : 'Offline'}</Text></View>} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }}>
        <View style={[st.card, { flexDirection: 'row', alignItems: 'center', gap: 18 }]}>
          <View style={{ width: 110, height: 110 }}>
            <Svg width={110} height={110} viewBox="0 0 104 104">
              <Circle cx="52" cy="52" r={R} stroke={C.line} strokeWidth="10" fill="none" />
              <Circle cx="52" cy="52" r={R} stroke={C.ok} strokeWidth="10" fill="none" strokeLinecap="round"
                strokeDasharray={`${total ? (CIR * inside) / total : 0} ${CIR}`} rotation="-90" origin="52, 52" />
            </Svg>
            <View style={st.ringMid}><Text style={st.ringNum}>{inside}</Text><Text style={st.dim}>entered</Text></View>
          </View>
          <View>
            <Text style={st.dim}>Registered</Text>
            <Text style={st.stat}>{total}</Text>
            <Text style={[st.dim, { marginTop: 8 }]}>Left to enter</Text>
            <Text style={[st.stat, { color: C.gold }]}>{total - inside}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
          <View style={{ flex: 1 }}><Btn quiet label="Search" onPress={() => navigation.navigate('Entries')} /></View>
          <View style={{ flex: 1 }}><Btn quiet label="Walk-in" onPress={() => setWalk(true)} /></View>
        </View>
        <Text style={[st.dim, { marginBottom: 6 }]}>Latest entries, updates every 10 seconds</Text>
        {latest.length === 0 && <Text style={st.dim}>No entries yet.</Text>}
        {latest.map((s) => <Row key={s.id} s={s} when />)}
      </ScrollView>
    </View>
  );
}

// ---------- SCAN ----------
function Scan() {
  const { show, result } = useContext(Ctx);
  const focused = useIsFocused();
  const [perm, ask] = useCameraPermissions();
  const busy = useRef(false);
  useEffect(() => { if (!result) busy.current = false; }, [result]);
  if (!focused || !perm) return <View style={{ flex: 1 }} />;
  if (!perm.granted) {
    return (
      <View style={st.center}>
        <Text style={[st.dim, { marginBottom: 16 }]}>Camera access is needed to scan entry QR codes.</Text>
        <Btn label="Allow camera" onPress={ask} />
      </View>
    );
  }
  const onScan = async ({ data }) => {
    if (busy.current) return;
    busy.current = true;
    if (!data.startsWith('DN26.')) return show({ ok: false, reason: 'INVALID' });
    show(await rpc('checkin_qr', { p_key: APP_KEY, p_token: data }));
  };
  return (
    <View style={{ flex: 1 }}>
      <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={result ? undefined : onScan} />
      <View pointerEvents="none" style={st.frame} />
      <Text pointerEvents="none" style={st.hint}>Point at the student's QR</Text>
    </View>
  );
}

// ---------- ENTRIES ----------
function Entries() {
  const { roster, show, reload } = useContext(Ctx);
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const inN = roster.filter((s) => s.entered).length;
  const cnt = { all: roster.length, left: roster.length - inN, in: inN };
  const t = q.trim().toLowerCase();
  const list = roster.filter((s) => (f === 'all' || (f === 'in') === !!s.entered) &&
    (!t || s.name.toLowerCase().includes(t) || s.uid.includes(t) || (s.mobile || '').includes(t)));
  return (
    <View style={{ flex: 1 }}>
      <Head title="Entries" />
      <View style={{ paddingHorizontal: 16 }}>
        <TextInput style={st.input} placeholder="Name, UID or mobile" placeholderTextColor={C.dim} value={q} onChangeText={setQ} autoCorrect={false} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
          {[['all', 'All'], ['left', 'Left'], ['in', 'Entered']].map(([k, l]) => (
            <Pressable key={k} onPress={() => setF(k)} style={[st.chip, f === k && st.chipOn]}>
              <Text style={[st.chipText, f === k && { color: C.ink }]}>{l} {cnt[k]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        refreshing={false}
        onRefresh={reload}
        ListEmptyComponent={<Text style={st.dim}>No match. Use Walk-in to register a new student.</Text>}
        renderItem={({ item: s }) => (
          <Row s={s} onMark={async () => show(await rpc('checkin_manual', { p_key: APP_KEY, p_student_id: s.id }))} />
        )}
      />
    </View>
  );
}

// ---------- WALK-IN (full-screen overlay) ----------
const FIELDS = [['uid', 'UID', 'number-pad'], ['name', 'Full name', 'default'], ['mobile', 'Mobile (10 digits)', 'phone-pad'], ['course', 'Course', 'default'], ['hostel', 'Hostel', 'default']];
function WalkIn() {
  const { show, setWalk } = useContext(Ctx);
  const [f, setF] = useState({ uid: '', name: '', mobile: '', course: '', hostel: '' });
  const submit = async () => {
    const d = f.mobile.replace(/\D/g, '').slice(-10);
    const r = await rpc('add_walkin', { p_key: APP_KEY, p_uid: f.uid.trim(), p_name: f.name.trim(), p_mobile: d.length === 10 ? '91' + d : '', p_course: f.course.trim(), p_hostel: f.hostel.trim() });
    if (r.ok) setWalk(false);
    show(r);
  };
  return (
    <View style={st.sheet}>
      <Head title="Walk-in" right={<Btn small quiet label="Close" onPress={() => setWalk(false)} />} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {FIELDS.map(([k, label, kb]) => (
          <TextInput key={k} style={st.input} placeholder={label} placeholderTextColor={C.dim} keyboardType={kb} value={f[k]} onChangeText={(v) => setF((p) => ({ ...p, [k]: v }))} />
        ))}
        {f.uid.trim() && f.name.trim() ? <Btn label="Register and let in" onPress={submit} /> : <Text style={st.dim}>UID and name are required.</Text>}
      </ScrollView>
    </View>
  );
}

// ---------- ADMIN (long-press the Home title) ----------
function Admin() {
  const { setAdmin } = useContext(Ctx);
  const [code, setCode] = useState('');
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const d = await rpc('get_stats', { p_admin_code: code });
    if (d && d.total_students !== undefined) { setS(d); setErr(''); } else setErr('Wrong code or no connection');
  }, [code]);
  useEffect(() => { if (!s) return; const id = setInterval(load, 10000); return () => clearInterval(id); }, [s, load]);
  const rows = s ? [['By QR', s.by_qr], ['By manual search', s.by_manual], ['Walk-ins', s.walkins], ['Repeat scans blocked', s.duplicate_scans], ['Invalid QR scans', s.invalid_scans]] : [];
  return (
    <View style={st.sheet}>
      <Head title="Admin" right={<Btn small quiet label="Close" onPress={() => setAdmin(false)} />} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {!s ? (
          <>
            <TextInput style={st.input} placeholder="Admin code" placeholderTextColor={C.dim} secureTextEntry value={code} onChangeText={setCode} autoCapitalize="none" />
            {!!err && <Text style={[st.dim, { color: '#FF8A92', marginBottom: 12 }]}>{err}</Text>}
            <Btn label="Open dashboard" onPress={load} />
          </>
        ) : (
          <>
            <Text style={[st.stat, { fontSize: 52 }]}>{s.entered} / {s.total_students}</Text>
            <Text style={[st.dim, { marginBottom: 20 }]}>entered, refreshes every 10 seconds</Text>
            {rows.map(([l, v]) => <View key={l} style={st.row}><Text style={[st.rname, { flex: 1 }]}>{l}</Text><Text style={st.rname}>{v}</Text></View>)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ---------- RESULT (full-screen green / red / amber) ----------
function Result({ r, onClose }) {
  const s = r.student;
  const bg = r.ok ? C.ok : r.reason === 'NETWORK' ? C.warn : C.no;
  const titles = { ALREADY_USED: 'Already entered', INVALID: 'Invalid QR', NETWORK: 'No connection', NOT_ALLOWED: 'App key is wrong', UID_EXISTS: 'UID already registered' };
  return (
    <Pressable style={[st.sheet, st.resultBox, { backgroundColor: bg }]} onPress={onClose}>
      <Text style={st.big}>{r.ok ? 'Entry allowed' : titles[r.reason] || 'Not allowed'}</Text>
      {s && (
        <>
          <Text style={st.name}>{s.name}</Text>
          <Text style={st.meta}>UID {s.uid}</Text>
          <Text style={st.meta}>{[s.course, s.hostel, s.room].filter(Boolean).join(', ')}</Text>
        </>
      )}
      {r.reason === 'ALREADY_USED' && <Text style={st.meta}>Entered at {fmt(r.used_at)}</Text>}
      {r.reason === 'NETWORK' && <Text style={st.meta}>Check internet and try again</Text>}
      <Text style={st.tap}>Tap to continue</Text>
    </Pressable>
  );
}

// ---------- APP ----------
const ICON = { Home: 'home-outline', Scan: 'qr-code-outline', Entries: 'list-outline' };

export default function App() {
  const [roster, setRoster] = useState([]);
  const [online, setOnline] = useState(true);
  const [result, setResult] = useState(null);
  const [walk, setWalk] = useState(false);
  const [admin, setAdmin] = useState(false);
  const loading = useRef(false);

  const loadRoster = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const d = await rpc('get_roster', { p_key: APP_KEY });
    loading.current = false;
    if (Array.isArray(d)) { setRoster(d); setOnline(true); AsyncStorage.setItem('roster', JSON.stringify(d)); } else setOnline(false);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('roster').then((v) => v && setRoster((cur) => (cur.length ? cur : JSON.parse(v))));
    loadRoster();
    const id = setInterval(loadRoster, 10000);
    return () => clearInterval(id);
  }, [loadRoster]);

  useEffect(() => {
    if (result?.ok) { const id = setTimeout(() => setResult(null), 1800); return () => clearTimeout(id); }
  }, [result]);

  const show = (r) => {
    Haptics.notificationAsync(r.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    const s = r.student;
    if (s) {
      const when = r.used_at || new Date().toISOString();
      setRoster((p) => (p.some((x) => x.id === s.id) ? p.map((x) => (x.id === s.id ? { ...x, entered: true, entered_at: when } : x)) : [{ ...s, entered: true, entered_at: when }, ...p]));
    }
    setResult(r);
  };

  return (
    <SafeAreaProvider>
      <Ctx.Provider value={{ roster, online, result, show, reload: loadRoster, setWalk, setAdmin }}>
        <NavigationContainer theme={{ ...DarkTheme, colors: { ...DarkTheme.colors, background: C.ink, card: C.card, border: C.line, primary: C.gold, text: C.text } }}>
          <Tab.Navigator screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: C.gold,
            tabBarInactiveTintColor: C.dim,
            tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
            tabBarIcon: ({ color, size }) => <Ionicons name={ICON[route.name]} size={size + 2} color={color} />,
          })}>
            <Tab.Screen name="Home" component={Home} />
            <Tab.Screen name="Scan" component={Scan} />
            <Tab.Screen name="Entries" component={Entries} />
          </Tab.Navigator>
        </NavigationContainer>
        {walk && <WalkIn />}
        {admin && <Admin />}
        {result && <Result r={result} onClose={() => setResult(null)} />}
      </Ctx.Provider>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: C.gold, fontSize: 22, fontWeight: '800' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16 },
  ringMid: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ringNum: { color: C.text, fontSize: 28, fontWeight: '800' },
  stat: { color: C.text, fontSize: 30, fontWeight: '800' },
  sheet: { ...StyleSheet.absoluteFillObject, backgroundColor: C.ink },
  resultBox: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  big: { color: '#fff', fontSize: 34, fontWeight: '900', textAlign: 'center' },
  name: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 20, textAlign: 'center' },
  meta: { color: '#fff', fontSize: 17, marginTop: 6, textAlign: 'center', opacity: 0.9 },
  tap: { color: '#fff', opacity: 0.7, position: 'absolute', bottom: 40 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, padding: 14, fontSize: 17, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line },
  av: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.line, alignItems: 'center', justifyContent: 'center' },
  avText: { color: C.text, fontWeight: '700', fontSize: 13 },
  rname: { color: C.text, fontSize: 16, fontWeight: '700' },
  dim: { color: C.dim, fontSize: 13 },
  in: { color: C.okText, fontWeight: '700', fontSize: 13 },
  left: { color: C.gold, fontWeight: '700', fontSize: 13 },
  chip: { backgroundColor: C.card, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { backgroundColor: C.gold },
  chipText: { color: C.dim, fontWeight: '700', fontSize: 13 },
  btn: { backgroundColor: C.gold, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  btnSm: { paddingVertical: 9, paddingHorizontal: 13 },
  btnQuiet: { backgroundColor: C.card },
  btnText: { color: C.ink, fontWeight: '800', fontSize: 15 },
  frame: { position: 'absolute', alignSelf: 'center', top: '24%', width: 240, height: 240, borderWidth: 3, borderColor: C.gold, borderRadius: 20 },
  hint: { position: 'absolute', alignSelf: 'center', bottom: 28, color: '#fff', fontSize: 15, fontWeight: '700', backgroundColor: '#16112Acc', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, overflow: 'hidden' },
});
