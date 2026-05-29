import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================
// 定数・設定
// ============================================================
const APP_VERSION = "v1.0.0";
const POLL_INTERVAL = 3000; // 3秒ポーリング

const DEFAULT_CHANNELS = [
  { id: "sales",    name: "営業チーム", desc: "営業関連" },
  { id: "dev",      name: "開発",       desc: "開発チーム" },
  { id: "random",   name: "雑談",       desc: "なんでもOK" },
  { id: "general",  name: "general",   desc: "全体連絡" },
];

const EMOJIS = ["👍","❤️","😂","🎉","🚀","👏","✅","🔥","💪","😊"];
const statusColor = s => s === "online" ? "#22c55e" : s === "away" ? "#f59e0b" : "#d1d5db";

const getFileCategory = (type) => {
  const t = (type || "").toLowerCase();
  if (["jpg","jpeg","png","gif","webp","heic","heif"].includes(t)) return "image";
  if (["mp4","mov","avi","webm"].includes(t)) return "video";
  if (["mp3","wav","m4a","aac"].includes(t)) return "audio";
  return "doc";
};

const FILE_COLORS = {
  pdf:  ["#ef4444","#fee2e2","PDF"], doc: ["#3b82f6","#dbeafe","DOC"],
  docx: ["#3b82f6","#dbeafe","DOC"], xls: ["#22c55e","#dcfce7","XLS"],
  xlsx: ["#22c55e","#dcfce7","XLS"], ppt: ["#f97316","#ffedd5","PPT"],
  pptx: ["#f97316","#ffedd5","PPT"], txt: ["#64748b","#f1f5f9","TXT"],
  csv:  ["#10b981","#d1fae5","CSV"], zip: ["#a855f7","#f3e8ff","ZIP"],
  rar:  ["#a855f7","#f3e8ff","RAR"],
};

// ============================================================
// アバターカラー
// ============================================================
const AVATAR_COLORS = ["#f97316","#6366f1","#0ea5e9","#10b981","#f59e0b","#ec4899","#8b5cf6","#14b8a6"];

const LOGIN_EXPIRE_DAYS = 7;
const LOGIN_EXPIRE_MS = LOGIN_EXPIRE_DAYS * 24 * 60 * 60 * 1000;

function getUser() {
  try {
    const saved = localStorage.getItem("koni_chat_user");
    const expire = localStorage.getItem("koni_chat_expire");
    if (!saved || !expire) return null;
    if (Date.now() > parseInt(expire)) {
      localStorage.removeItem("koni_chat_user");
      localStorage.removeItem("koni_chat_expire");
      return null;
    }
    const user = JSON.parse(saved);
    // adminフラグがない古いデータは無効
    if (user.admin === undefined) {
      localStorage.removeItem("koni_chat_user");
      localStorage.removeItem("koni_chat_expire");
      return null;
    }
    return user;
  } catch {}
  return null;
}

function saveUser(user) {
  localStorage.setItem("koni_chat_user", JSON.stringify(user));
  localStorage.setItem("koni_chat_expire", String(Date.now() + LOGIN_EXPIRE_MS));
}

function logoutUser() {
  localStorage.removeItem("koni_chat_user");
  localStorage.removeItem("koni_chat_expire");
}

// ============================================================
// メンバー一覧（固定）
// ============================================================
const MEMBERS = [
  { id: "konishi",  name: "小西公幸",  avatar: "小", color: "#6366f1", password: "masa0224", admin: true },
  { id: "masato",   name: "まさと",    avatar: "ま", color: "#0ea5e9", password: "masato",   admin: false },
  { id: "nakamura", name: "中村祐希",  avatar: "中", color: "#10b981", password: "miami0383",admin: false },
  { id: "user1",    name: "ユーザー1", avatar: "1",  color: "#f59e0b", password: "1234",     admin: false },
  { id: "user2",    name: "ユーザー2", avatar: "2",  color: "#ec4899", password: "1234",     admin: false },
];

// ============================================================
// hooks
// ============================================================
function useIsMobile() {
  const [v, setV] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const h = () => setV(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return v;
}

// ============================================================
// API関数（カーセラと同じfetch直叩き方式）
// ============================================================
async function apiGet(key) {
  const res = await fetch(`/api/data?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error("GET failed");
  const data = await res.json();
  return data.data;
}

async function apiSet(key, value) {
  const res = await fetch(`/api/data?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error("SET failed");
  return true;
}

// ============================================================
// DM共通キー生成（AとBのIDを並べ替えて共通キーにする）
// ============================================================
function getDmKey(id1, id2) {
  const sorted = [id1, id2].sort();
  return `dm:${sorted[0]}:${sorted[1]}`;
}

// ============================================================
// 既読管理
// ============================================================
// キー: read:{channelId}:{userId} → 最後に読んだメッセージID

// ============================================================
// ファイルアップロード（Vercel Blob）
// ============================================================
async function uploadFile(file) {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "x-file-name": encodeURIComponent(file.name),
      "x-file-type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!res.ok) throw new Error("アップロードに失敗しました");
  return res.json();
}

// ============================================================
// ファイルカード
// ============================================================
function FileCard({ file }) {
  const cat = getFileCategory(file.type);
  const [imgError, setImgError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const colorInfo = FILE_COLORS[file.type] || ["#94a3b8", "#f1f5f9", (file.type || "FILE").toUpperCase()];
  const [iconColor, bgColor, label] = colorInfo;

  const handleDownload = (e) => {
    e?.stopPropagation();
    if (file.url) {
      const a = document.createElement("a");
      a.href = file.url; a.download = file.name; a.click();
    }
  };

  if (cat === "image" && !imgError) return (
    <div style={{ marginTop: 6, maxWidth: 260 }}>
      <div style={{ borderRadius: 12, overflow: "hidden", cursor: "pointer", border: "1px solid #e8edf3", position: "relative", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
        onClick={() => setExpanded(true)}>
        <img src={file.url || file.preview} alt={file.name} onError={() => setImgError(true)}
          style={{ display: "block", width: "100%", maxWidth: 260, maxHeight: 180, objectFit: "cover" }} />
        <button onClick={handleDownload} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>⬇ 保存</button>
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{file.name} · {file.size}</div>
      {expanded && (
        <div onClick={() => setExpanded(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ position: "relative" }}>
            <img src={file.url || file.preview} alt={file.name} style={{ display: "block", maxWidth: "90vw", maxHeight: "80vh", borderRadius: 12, objectFit: "contain" }} />
            <button onClick={handleDownload} style={{ position: "absolute", bottom: -48, left: "50%", transform: "translateX(-50%)", background: "#6366f1", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", padding: "10px 28px", fontSize: 14, fontWeight: 700 }}>⬇ ダウンロード</button>
            <button onClick={() => setExpanded(false)} style={{ position: "absolute", top: -14, right: -14, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", color: "#fff", cursor: "pointer", width: 30, height: 30, fontSize: 16 }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );

  if (cat === "video") return (
    <div style={{ marginTop: 6, maxWidth: 260 }}>
      <div style={{ background: "#0f172a", borderRadius: 12, overflow: "hidden", position: "relative", border: "1px solid #e8edf3" }}>
        {file.url
          ? <video controls style={{ width: "100%", maxHeight: 160, display: "block" }}><source src={file.url} /></video>
          : <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>🎬 {file.name}</div>
        }
        <button onClick={handleDownload} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>⬇</button>
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{file.name} · {file.size}</div>
    </div>
  );

  if (cat === "audio") return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e8edf3", borderRadius: 12, padding: "10px 14px", maxWidth: 280 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎵</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{file.size}</div>
        </div>
        <button onClick={handleDownload} style={{ background: "#6366f1", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", padding: "6px 10px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>⬇</button>
      </div>
    </div>
  );

  // doc / unknown
  const isUnknown = !FILE_COLORS[file.type];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: isUnknown ? "#faf5ff" : "#f8fafc", border: `1px ${isUnknown ? "dashed #d8b4fe" : "solid #e8edf3"}`, borderRadius: 12, padding: "12px 14px", maxWidth: 300 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: bgColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: iconColor, flexShrink: 0 }}>{label}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
            {isUnknown && <span style={{ fontSize: 10, background: "#f3e8ff", color: "#9333ea", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>プレビュー不可</span>}
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{file.size}</span>
          </div>
        </div>
        <button onClick={handleDownload} style={{ background: isUnknown ? "#9333ea" : "linear-gradient(135deg,#6366f1,#0ea5e9)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", padding: "7px 12px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>⬇</button>
      </div>
    </div>
  );
}

// ============================================================
// 既読表示コンポーネント
// ============================================================
function ReadStatus({ channelId, msgId, myId, members, sentAt }) {
  const [readers, setReaders] = useState([]);

  useEffect(() => {
    const check = async () => {
      const readMembers = [];
      for (const m of members) {
        if (m.id === myId) continue;
        try {
          const readAt = await apiGet(`read:${channelId}:${m.id}`);
          // sentAt以降にそのチャンネルを開いた人だけ既読
          if (readAt && readAt > sentAt) readMembers.push(m);
        } catch {}
      }
      setReaders(readMembers);
    };
    check();
    const timer = setInterval(check, 3000);
    return () => clearInterval(timer);
  }, [channelId, myId, sentAt]);

  if (readers.length === 0) return (
    <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>未読</div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
      <span style={{ fontSize: 11, color: "#0ea5e9", fontWeight: 600 }}>既読</span>
      {readers.map(m => (
        <div key={m.id} style={{ width: 16, height: 16, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" }}>{m.avatar}</div>
      ))}
    </div>
  );
}

// ============================================================
// メインアプリ
// ============================================================
// ============================================================
// 名前入力画面
// ============================================================
function LoginScreen({ onLogin }) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = () => {
    const member = MEMBERS.find(m => m.id === id.trim().toLowerCase());
    if (!member) { setError("IDが見つかりません"); return; }
    if (member.password !== password) { setError("パスワードが違います"); return; }
    const user = { id: member.id, name: member.name, avatar: member.avatar, color: member.color, admin: member.admin };
    saveUser(user);
    onLogin(user);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f8fafc", fontFamily: "'Noto Sans JP',sans-serif", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "40px 32px", width: "100%", maxWidth: 380, boxShadow: "0 8px 40px rgba(0,0,0,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/logo.png" alt="スーパーこにチャット" style={{ height: 64, objectFit: "contain", marginBottom: 16 }} onError={e => e.target.style.display = "none"} />
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", marginBottom: 4 }}>スーパーこにチャット</h1>
          <p style={{ fontSize: 13, color: "#94a3b8" }}>ログイン</p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6 }}>ID</label>
          <input value={id} onChange={e => { setId(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="user"
            style={{ width: "100%", border: "1.5px solid #e8edf3", borderRadius: 10, padding: "11px 14px", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            onFocus={e => e.target.style.borderColor = "#6366f1"}
            onBlur={e => e.target.style.borderColor = "#e8edf3"} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6 }}>パスワード</label>
          <div style={{ position: "relative" }}>
            <input value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              type={showPass ? "text" : "password"}
              placeholder="パスワード"
              style={{ width: "100%", border: "1.5px solid #e8edf3", borderRadius: 10, padding: "11px 44px 11px 14px", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              onFocus={e => e.target.style.borderColor = "#6366f1"}
              onBlur={e => e.target.style.borderColor = "#e8edf3"} />
            <button onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#94a3b8" }}>{showPass ? "🙈" : "👁"}</button>
          </div>
        </div>
        {error && <div style={{ background: "#fee2e2", color: "#ef4444", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 14, textAlign: "center", fontWeight: 600 }}>{error}</div>}
        <button onClick={handleSubmit} disabled={!id || !password} style={{
          width: "100%", background: (id && password) ? "linear-gradient(135deg,#6366f1,#0ea5e9)" : "#f1f5f9",
          border: "none", borderRadius: 12, padding: "13px",
          color: (id && password) ? "#fff" : "#94a3b8",
          fontSize: 15, fontWeight: 700, cursor: (id && password) ? "pointer" : "default",
          boxShadow: (id && password) ? "0 4px 14px rgba(99,102,241,0.4)" : "none",
        }}>ログイン</button>
        <div style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: "#94a3b8" }}>7日間ログイン状態を保持します</div>
      </div>
    </div>
  );
}

export default function App() {
  const savedUser = getUser();
  const [me, setMe] = useState(savedUser);
  const isMobile = useIsMobile();

  // --- State ---
  const [channels, setChannels]       = useState(DEFAULT_CHANNELS);
  const [activeChannel, setActiveChannel] = useState("general");
  const [messages, setMessages]       = useState({});
  const [tasks, setTasks]             = useState({});
  const [members, setMembers]         = useState(MEMBERS.map(m => ({ id: m.id, name: m.name, avatar: m.avatar, color: m.color, admin: m.admin })));
  const [input, setInput]             = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panel, setPanel]             = useState(null);
  const [emojiFor, setEmojiFor]       = useState(null);
  const [hoveredMsg, setHoveredMsg]   = useState(null);
  const [showNewCh, setShowNewCh]     = useState(false);
  const [newChName, setNewChName]     = useState("");
  const [showTaskAdd, setShowTaskAdd] = useState(false);
  const [newTask, setNewTask]         = useState({ text: "", assignee: "me", due: "" });
  const [searchOpen, setSearchOpen]   = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifGranted, setNotifGranted] = useState(false);
  const [toast, setToast]             = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [loading, setLoading]         = useState(true);
  const [editingChName, setEditingChName] = useState(false);
  const [dmUnread, setDmUnread] = useState({});  // { "dm-konishi": 2, ... }
  const [editMember, setEditMember]   = useState(null);
  const [editForm, setEditForm]       = useState({ name: "", password: "" });
  const [localMembers, setLocalMembers] = useState(MEMBERS.map(m => ({ ...m })));

  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastMsgIds  = useRef({});

  const isDM = activeChannel.startsWith("dm-");
  const dmMemberId = isDM ? activeChannel.replace("dm-", "") : null;
  const dmMember = dmMemberId ? members.find(m => m.id === dmMemberId) : null;
  const chInfo = channels.find(c => c.id === activeChannel);
  const msgs = messages[activeChannel] || [];
  const chTasks = tasks[activeChannel] || [];
  const totalUnread = channels.reduce((s, c) => s + (c.unread || 0), 0)
    + Object.values(dmUnread).reduce((s, v) => s + v, 0);

  // --- Toast ---
  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- 通知許可 ---
  const requestNotif = async () => {
    if (!("Notification" in window)) { showToast("このブラウザは通知に対応していません"); return; }
    const p = await Notification.requestPermission();
    if (p === "granted") { setNotifGranted(true); showToast("🔔 通知を有効にしました！"); }
  };

  const sendNotif = useCallback((title, body) => {
    if (notifGranted && document.hidden) new Notification(title, { body, icon: "/icons/icon-192.png" });
  }, [notifGranted]);

  // --- チャンネル読み込み ---
  useEffect(() => {
    const loadChannels = async () => {
      try {
        const saved = await apiGet("chat:channels");
        if (saved && Array.isArray(saved) && saved.length > 0) {
          setChannels(saved);
        } else {
          setChannels(DEFAULT_CHANNELS);
          await apiSet("chat:channels", DEFAULT_CHANNELS);
        }
      } catch {
        setChannels(DEFAULT_CHANNELS);
      }
      setLoading(false);
    };
    loadChannels();
  }, []);

  // --- メッセージ読み込み（ポーリング） ---
  const getMsgKey = (chId) => {
    if (chId.startsWith("dm-") && me?.id) {
      const otherId = chId.replace("dm-", "");
      return getDmKey(me.id, otherId);
    }
    return `messages:${chId}`;
  };

  const loadMessages = useCallback(async (chId) => {
    try {
      const key = chId.startsWith("dm-") && me?.id
        ? getDmKey(me.id, chId.replace("dm-", ""))
        : `messages:${chId}`;
      const data = await apiGet(key);
      const msgList = Array.isArray(data) ? data : [];
      setMessages(prev => {
        const lastId = lastMsgIds.current[chId];
        const isFirstLoad = !lastId;

        // 新着メッセージを検出
        const newMsgs = lastId ? msgList.filter(m => m.id > lastId) : [];

        // 初回ロード以外で新着があり、かつ今見ていないチャンネルの場合に未読カウント
        if (!isFirstLoad && newMsgs.length > 0 && chId !== activeChannel) {
          const othersNewMsgs = newMsgs.filter(m => m.uid !== me?.id);
          if (othersNewMsgs.length > 0) {
            if (chId.startsWith("dm-")) {
              setDmUnread(p => ({ ...p, [chId]: (p[chId] || 0) + othersNewMsgs.length }));
            } else {
              setChannels(p => p.map(c => c.id === chId ? { ...c, unread: (c.unread || 0) + othersNewMsgs.length } : c));
            }
            othersNewMsgs.forEach(m => sendNotif("スーパーこにチャット", `${m.name}: ${m.text || "ファイルが届きました"}`));
          }
        }

        // 最後のメッセージIDを記録
        if (msgList.length > 0) {
          lastMsgIds.current[chId] = msgList[msgList.length - 1].id;
        }
        return { ...prev, [chId]: msgList };
      });
    } catch {}
  }, [activeChannel, me?.id, sendNotif]);

  // 初回 & ポーリング
  useEffect(() => {
    loadMessages(activeChannel);
    const timer = setInterval(() => {
      // メッセージをポーリング（チャンネル＋全DM）
      channels.forEach(ch => loadMessages(ch.id));
      MEMBERS.filter(m => m.id !== me?.id).forEach(m => loadMessages(`dm-${m.id}`));
      // タスクもポーリング（全チャンネル）
      channels.forEach(async ch => {
        try {
          const data = await apiGet(`tasks:${ch.id}`);
          setTasks(prev => ({ ...prev, [ch.id]: Array.isArray(data) ? data : [] }));
        } catch {}
      });
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [activeChannel, channels, loadMessages]);

  // タスク読み込み（アクティブチャンネル切り替え時）
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const data = await apiGet(`tasks:${activeChannel}`);
        setTasks(prev => ({ ...prev, [activeChannel]: Array.isArray(data) ? data : [] }));
      } catch {}
    };
    loadTasks();
  }, [activeChannel]);

  // 全チャンネルのタスクを初回ロード
  useEffect(() => {
    const loadAllTasks = async () => {
      for (const ch of channels) {
        try {
          const data = await apiGet(`tasks:${ch.id}`);
          setTasks(prev => ({ ...prev, [ch.id]: Array.isArray(data) ? data : [] }));
        } catch {}
      }
    };
    loadAllTasks();
  }, [channels.length]);

  // スクロール（自分が送信した時 or チャンネル切り替え時のみ）
  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeChannel]);

  // --- チャンネル選択 ---
  const selectChannel = (id) => {
    setActiveChannel(id);
    setChannels(p => p.map(c => c.id === id ? { ...c, unread: 0 } : c));
    if (id.startsWith("dm-")) setDmUnread(p => ({ ...p, [id]: 0 }));
    if (isMobile) setSidebarOpen(false);
    setPanel(null);
    // 既読をRedisに保存
    if (me?.id) {
      apiSet(`read:${id}:${me.id}`, Date.now()).catch(() => {});
    }
  };

  // --- メッセージ送信 ---
  const send = async (extraProps = {}) => {
    if (!input.trim() && !extraProps.file && !extraProps.zoom) return;
    const msg = {
      id: Date.now(),
      uid: me.id, name: me.name, avatar: me.avatar, color: me.color,
      time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      text: input.trim(), reactions: [], file: null, zoom: null,
      ...extraProps,
    };
    // 楽観的更新（即座に画面に表示）
    setMessages(prev => ({ ...prev, [activeChannel]: [...(prev[activeChannel] || []), msg] }));
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    // 送信時は既読不要（開いてるので当然読んでいる）

    // Redisに保存（楽観的更新後のメッセージリストをそのまま保存）
    try {
      const current = messages[activeChannel] || [];
      const saveKey = activeChannel.startsWith("dm-") && me?.id
        ? getDmKey(me.id, activeChannel.replace("dm-", ""))
        : `messages:${activeChannel}`;
      await apiSet(saveKey, [...current, msg]);
    } catch { showToast("送信に失敗しました"); }
  };

  // --- ファイル送信 ---
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    showToast("📎 アップロード中...");
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      const cat = getFileCategory(ext);
      // 画像はプレビューURL生成（アップロード前に表示）
      const preview = cat === "image" ? URL.createObjectURL(file) : null;
      // Vercel Blobにアップロード
      let fileInfo;
      try {
        fileInfo = await uploadFile(file);
      } catch {
        // Blobが未設定の場合はプレビューのみで動作
        fileInfo = { url: preview, name: file.name, size: `${(file.size/1024/1024).toFixed(1)}MB`, type: ext };
      }
      await send({ text: "", file: { ...fileInfo, preview } });
      showToast("✅ 送信しました！");
    } catch (err) {
      showToast("❌ " + err.message);
    } finally {
      setUploading(false);
    }
  };

  // --- Zoom送信 ---
  const sendZoom = async () => {
    const url = `https://zoom.us/j/${Math.floor(Math.random() * 900000000 + 100000000)}`;
    await send({ text: `📹 Zoom会議を開始しました\n${url}`, zoom: url });
  };

  // --- リアクション ---
  const react = async (msgId, emoji) => {
    const updated = (messages[activeChannel] || []).map(m => {
      if (m.id !== msgId) return m;
      const ex = m.reactions.find(r => r.emoji === emoji);
      return { ...m, reactions: ex ? m.reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1 } : r) : [...m.reactions, { emoji, count: 1 }] };
    });
    setMessages(prev => ({ ...prev, [activeChannel]: updated }));
    setEmojiFor(null);
    try { await apiSet(`messages:${activeChannel}`, updated); } catch {}
  };

  // --- チャンネル追加 ---
  const renameChannel = async (newName) => {
    if (!newName.trim() || newName.trim() === chInfo?.name) { setEditingChName(false); return; }
    const updated = channels.map(c => c.id === activeChannel ? { ...c, name: newName.trim() } : c);
    setChannels(updated);
    setEditingChName(false);
    try { await apiSet("chat:channels", updated); } catch {}
    showToast("チャンネル名を変更しました");
  };

  const addChannel = async () => {
    if (!newChName.trim()) return;
    const newCh = { id: `ch_${Date.now()}`, name: newChName.trim(), desc: "", unread: 0 };
    const updated = [...channels, newCh];
    setChannels(updated);
    setMessages(prev => ({ ...prev, [newCh.id]: [] }));
    selectChannel(newCh.id);
    setNewChName(""); setShowNewCh(false);
    try { await apiSet("chat:channels", updated); } catch {}
  };

  const deleteChannel = async (chId) => {
    if (chId === "general") { showToast("generalは削除できません"); return; }
    if (!window.confirm("このチャンネルを削除しますか？")) return;
    const updated = channels.filter(c => c.id !== chId);
    setChannels(updated);
    if (activeChannel === chId) selectChannel("general");
    try { await apiSet("chat:channels", updated); } catch {}
    showToast("チャンネルを削除しました");
  };

  // --- タスク追加 ---
  const addTask = async () => {
    if (!newTask.text.trim()) return;
    const task = { id: `task_${Date.now()}`, ...newTask, done: false };
    const updated = [...chTasks, task];
    setTasks(prev => ({ ...prev, [activeChannel]: updated }));
    setNewTask({ text: "", assignee: "me", due: "" });
    setShowTaskAdd(false);
    try { await apiSet(`tasks:${activeChannel}`, updated); } catch {}
  };

  const toggleTask = async (tid) => {
    const updated = chTasks.map(t => t.id === tid ? { ...t, done: !t.done } : t);
    setTasks(prev => ({ ...prev, [activeChannel]: updated }));
    try { await apiSet(`tasks:${activeChannel}`, updated); } catch {}
  };

  const deleteTask = async (tid) => {
    const updated = chTasks.filter(t => t.id !== tid);
    setTasks(prev => ({ ...prev, [activeChannel]: updated }));
    try { await apiSet(`tasks:${activeChannel}`, updated); } catch {}
  };

  const searchResults = searchQuery
    ? Object.entries(messages).flatMap(([ch, ms]) => ms.filter(m => m.text?.includes(searchQuery)).map(m => ({ ...m, ch }))).slice(0, 6)
    : [];

  // ============================================================
  // RENDER
  // ============================================================
  if (!me) return <LoginScreen onLogin={(user) => { setMe(user); }} />;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f8fafc", flexDirection: "column", gap: 16 }}>
      <img src="/logo.png" alt="ロゴ" style={{ height: 48, objectFit: "contain" }} onError={e => e.target.style.display = "none"} />
      <div style={{ fontSize: 14, color: "#94a3b8" }}>読み込み中...</div>
    </div>
  );

  // ---- SIDEBAR ----
  const SidebarEl = (
    <div style={{
      width: isMobile ? "82vw" : 248, maxWidth: 300,
      background: "#fff", borderRight: "1px solid #e8edf3",
      display: "flex", flexDirection: "column", height: "100%",
      position: isMobile ? "fixed" : "relative",
      left: 0, top: 0, zIndex: isMobile ? 200 : 1,
      transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
      transition: "transform 0.25s cubic-bezier(.4,0,.2,1)",
      boxShadow: isMobile && sidebarOpen ? "4px 0 32px rgba(0,0,0,0.13)" : "none",
    }}>
      {/* Logo */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo.png" alt="スーパーこにチャット" style={{ height: 36, objectFit: "contain" }}
          onError={e => { e.target.style.display = "none"; }} />
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#94a3b8", padding: 4 }}>✕</button>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9" }}>
        <div onClick={() => { setSearchOpen(true); if (isMobile) setSidebarOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 7, background: "#f8fafc", border: "1px solid #e8edf3", borderRadius: 8, padding: "7px 11px", cursor: "pointer" }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>🔍</span>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>検索...</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {/* 通知ボタン */}
        {!notifGranted && (
          <div style={{ margin: "4px 12px 8px" }}>
            <button onClick={requestNotif} style={{ width: "100%", background: "linear-gradient(135deg,#6366f1,#0ea5e9)", border: "none", borderRadius: 8, padding: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🔔 通知を有効にする</button>
          </div>
        )}

        {/* Channels */}
        <div style={{ padding: "6px 16px 3px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>チャンネル</span>
          <button onClick={() => setShowNewCh(true)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 20, padding: "0 2px" }}
            onMouseEnter={e => e.currentTarget.style.color = "#6366f1"}
            onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}>+</button>
        </div>
        {channels.map(ch => (
          <div key={ch.id}
            onClick={() => selectChannel(ch.id)}
            onContextMenu={e => { e.preventDefault(); deleteChannel(ch.id); }}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: isMobile ? "10px 16px" : "6px 16px", cursor: "pointer",
              background: activeChannel === ch.id ? "#eef2ff" : "transparent",
              borderRight: activeChannel === ch.id ? "3px solid #6366f1" : "3px solid transparent",
              color: activeChannel === ch.id ? "#4f46e5" : "#475569",
              fontWeight: activeChannel === ch.id ? 700 : 400, fontSize: 13,
              position: "relative",
            }}
            onMouseEnter={e => {
              if (activeChannel !== ch.id) e.currentTarget.style.background = "#f8fafc";
              const btn = e.currentTarget.querySelector(".ch-del-btn");
              if (btn && ch.id !== "general") btn.style.display = "flex";
            }}
            onMouseLeave={e => {
              if (activeChannel !== ch.id) e.currentTarget.style.background = "transparent";
              const btn = e.currentTarget.querySelector(".ch-del-btn");
              if (btn) btn.style.display = "none";
            }}>
            <span style={{ color: activeChannel === ch.id ? "#6366f1" : "#94a3b8", fontWeight: 700 }}>#</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>
            {(tasks[ch.id] || []).filter(t => !t.done).length > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 2, background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 10, padding: "1px 6px", marginRight: 2 }}>
                <span style={{ fontSize: 9, color: "#92400e", fontWeight: 600 }}>残タスク</span>
                <span style={{ fontSize: 10, color: "#92400e", fontWeight: 700 }}>{(tasks[ch.id] || []).filter(t => !t.done).length}</span>
              </span>
            )}
            {ch.unread > 0 && (
              <span style={{
                background: "#ef4444", color: "#fff",
                borderRadius: "50%", fontSize: 11, fontWeight: 700,
                minWidth: 20, height: 20,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 5px", flexShrink: 0,
              }}>{ch.unread}</span>
            )}
            {ch.id !== "general" && (
              <button className="ch-del-btn" onClick={e => { e.stopPropagation(); deleteChannel(ch.id); }} style={{
                display: "none", alignItems: "center", justifyContent: "center",
                background: "#fee2e2", border: "none", borderRadius: 6,
                color: "#ef4444", cursor: "pointer", width: 20, height: 20, fontSize: 12,
                flexShrink: 0,
              }}>✕</button>
            )}
          </div>
        ))}

        {/* DMs */}
        <div style={{ padding: "10px 16px 3px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>ダイレクト</span>
        </div>
        {members.filter(m => m.id !== me?.id).map(m => (
          <div key={m.id} onClick={() => selectChannel(`dm-${m.id}`)} style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: isMobile ? "9px 16px" : "5px 16px", cursor: "pointer",
            background: activeChannel === `dm-${m.id}` ? "#eef2ff" : "transparent",
            borderRight: activeChannel === `dm-${m.id}` ? "3px solid #6366f1" : "3px solid transparent",
          }}
            onMouseEnter={e => { if (activeChannel !== `dm-${m.id}`) e.currentTarget.style.background = "#f8fafc"; }}
            onMouseLeave={e => { if (activeChannel !== `dm-${m.id}`) e.currentTarget.style.background = "transparent"; }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{m.avatar}</div>
              <div style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderRadius: "50%", background: statusColor(m.status), border: "2px solid #fff" }} />
            </div>
            <span style={{ fontSize: 13, color: activeChannel === `dm-${m.id}` ? "#4f46e5" : "#475569", fontWeight: activeChannel === `dm-${m.id}` ? 700 : 400, flex: 1 }}>{m.name}</span>
            {(dmUnread[`dm-${m.id}`] || 0) > 0 && (
              <span style={{
                background: "#ef4444", color: "#fff",
                borderRadius: "50%", fontSize: 11, fontWeight: 700,
                minWidth: 20, height: 20,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 5px", flexShrink: 0,
              }}>{dmUnread[`dm-${m.id}`]}</span>
            )}
          </div>
        ))}
      </div>

      {/* User footer */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid #f1f5f9", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: me?.admin ? 8 : 0 }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: me.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>{me.avatar}</div>
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 9, height: 9, borderRadius: "50%", background: "#22c55e", border: "2px solid #fff" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{me.name}</span>
              {me?.admin && <span style={{ fontSize: 10, background: "#6366f1", color: "#fff", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>管理者</span>}
            </div>
            <div style={{ fontSize: 11, color: "#22c55e" }}>● オンライン</div>
          </div>
          <button onClick={requestNotif} title="通知設定" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: notifGranted ? "#6366f1" : "#94a3b8", padding: 4 }}>🔔</button>
          <button onClick={() => { if (window.confirm("ログアウトしますか？")) { logoutUser(); setMe(null); } }} title="ログアウト" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#94a3b8", padding: 4 }}>🚪</button>
        </div>
        {me?.admin && (
          <button onClick={() => setPanel(p => p === "admin" ? null : "admin")} style={{
            width: "100%", background: panel === "admin" ? "#eef2ff" : "#f8fafc",
            border: "1px solid #e8edf3", borderRadius: 8, padding: "6px",
            color: panel === "admin" ? "#4f46e5" : "#64748b", cursor: "pointer",
            fontSize: 12, fontWeight: 700,
          }}>⚙️ 管理者設定</button>
        )}
      </div>
    </div>
  );

  // ---- TASK PANEL ----

  const AdminPanel = panel === "admin" && me?.admin ? (
    <div style={{
      width: isMobile ? "100%" : 300, flexShrink: 0,
      background: "#fff", borderLeft: "1px solid #e8edf3",
      display: "flex", flexDirection: "column",
      position: isMobile ? "fixed" : "relative",
      right: 0, top: 0, height: "100%", zIndex: isMobile ? 200 : 1,
    }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>⚙️ 管理者設定</span>
        <button onClick={() => setPanel(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#94a3b8" }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>メンバー管理</div>
        {localMembers.map(m => (
          <div key={m.id} style={{ background: "#f8fafc", border: "1px solid #e8edf3", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
            {editMember === m.id ? (
              <div>
                <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="名前" style={{ width: "100%", border: "1px solid #e8edf3", borderRadius: 6, padding: "6px 10px", fontSize: 13, marginBottom: 6, boxSizing: "border-box", fontFamily: "inherit", outline: "none" }} />
                <input value={editForm.password} onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="新しいパスワード" type="text" style={{ width: "100%", border: "1px solid #e8edf3", borderRadius: 6, padding: "6px 10px", fontSize: 13, marginBottom: 8, boxSizing: "border-box", fontFamily: "inherit", outline: "none" }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => {
                    setLocalMembers(prev => prev.map(lm => lm.id === m.id ? { ...lm, name: editForm.name || lm.name, password: editForm.password || lm.password } : lm));
                    setEditMember(null);
                    showToast("✅ 更新しました");
                  }} style={{ flex: 1, background: "#6366f1", border: "none", borderRadius: 6, padding: 7, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>保存</button>
                  <button onClick={() => setEditMember(null)} style={{ flex: 1, background: "#f1f5f9", border: "none", borderRadius: 6, padding: 7, color: "#64748b", fontSize: 12, cursor: "pointer" }}>キャンセル</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{m.avatar}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{m.name}</span>
                    {m.admin && <span style={{ fontSize: 10, background: "#6366f1", color: "#fff", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>管理者</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>ID: {m.id}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => { setEditMember(m.id); setEditForm({ name: m.name, password: "" }); }} style={{ background: "#eef2ff", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "#6366f1", fontWeight: 600 }}>編集</button>
                  {!m.admin && (
                    <button onClick={() => {
                      setLocalMembers(prev => prev.map(lm => ({ ...lm, admin: lm.id === m.id ? true : lm.admin })));
                      showToast(`${m.name}を管理者にしました`);
                    }} style={{ background: "#f0fdf4", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "#22c55e", fontWeight: 600 }}>管理者に</button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div style={{ marginTop: 16, padding: "12px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: "#92400e", fontWeight: 600, marginBottom: 4 }}>⚠️ 注意</div>
          <div style={{ fontSize: 11, color: "#b45309" }}>変更はこのセッション中のみ有効です。コードへの恒久的な変更は開発者に依頼してください。</div>
        </div>
      </div>
    </div>
  ) : null;

  const TaskPanel = panel ? (
    <div style={{
      width: isMobile ? "100%" : 272, flexShrink: 0,
      background: "#fff", borderLeft: "1px solid #e8edf3",
      display: "flex", flexDirection: "column",
      position: isMobile ? "fixed" : "relative",
      right: 0, top: 0, height: "100%", zIndex: isMobile ? 200 : 1,
    }}>
      <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {["task", "members"].map(p => (
            <button key={p} onClick={() => setPanel(p)} style={{ background: panel === p ? "#eef2ff" : "none", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: panel === p ? "#4f46e5" : "#64748b" }}>
              {p === "task" ? "✅ タスク" : "👥 メンバー"}
            </button>
          ))}
        </div>
        <button onClick={() => setPanel(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#94a3b8" }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {panel === "task" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>タスク一覧</span>
              <button onClick={() => setShowTaskAdd(true)} style={{ background: "linear-gradient(135deg,#6366f1,#0ea5e9)", border: "none", borderRadius: 8, padding: "5px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>＋追加</button>
            </div>
            {showTaskAdd && (
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: 12, marginBottom: 10, border: "1px solid #e8edf3" }}>
                <input value={newTask.text} onChange={e => setNewTask(p => ({ ...p, text: e.target.value }))}
                  placeholder="タスク名" autoFocus
                  style={{ width: "100%", border: "1px solid #e8edf3", borderRadius: 6, padding: "6px 10px", fontSize: 13, marginBottom: 6, boxSizing: "border-box", fontFamily: "inherit", outline: "none" }} />
                <input type="text" value={newTask.due} onChange={e => setNewTask(p => ({ ...p, due: e.target.value }))}
                  placeholder="期限（例: 6/1）"
                  style={{ width: "100%", border: "1px solid #e8edf3", borderRadius: 6, padding: "6px 10px", fontSize: 12, marginBottom: 6, boxSizing: "border-box", fontFamily: "inherit", outline: "none" }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={addTask} style={{ flex: 1, background: "#6366f1", border: "none", borderRadius: 6, padding: 7, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>追加</button>
                  <button onClick={() => setShowTaskAdd(false)} style={{ flex: 1, background: "#f1f5f9", border: "none", borderRadius: 6, padding: 7, color: "#64748b", fontSize: 12, cursor: "pointer" }}>キャンセル</button>
                </div>
              </div>
            )}
            {chTasks.length === 0 && !showTaskAdd && (
              <div style={{ textAlign: "center", padding: "30px 0", color: "#94a3b8", fontSize: 13 }}>タスクはありません</div>
            )}
            {chTasks.map(task => (
              <div key={task.id} style={{ background: task.done ? "#f8fafc" : "#fff", border: "1px solid #e8edf3", borderRadius: 10, padding: "10px 12px", marginBottom: 6, opacity: task.done ? 0.6 : 1 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <button onClick={() => toggleTask(task.id)} style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, background: task.done ? "#6366f1" : "#fff", border: `2px solid ${task.done ? "#6366f1" : "#cbd5e1"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {task.done && <span style={{ color: "#fff", fontSize: 10 }}>✓</span>}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#0f172a", textDecoration: task.done ? "line-through" : "none" }}>{task.text}</div>
                    {task.due && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 3 }}>📅 {task.due}</div>}
                  </div>
                  <button onClick={() => deleteTask(task.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 14, padding: "0 2px" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "#cbd5e1"}>✕</button>
                </div>
              </div>
            ))}
          </>
        )}
        {panel === "members" && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>メンバー ({members.length}人)</div>
            {members.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>{m.avatar}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "#22c55e" }}>● オンライン</div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f8fafc", fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", overflow: "hidden", position: "relative" }}>

      {/* オーバーレイ */}
      {isMobile && (sidebarOpen || panel) && (
        <div onClick={() => { setSidebarOpen(false); setPanel(null); }} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 199, backdropFilter: "blur(2px)" }} />
      )}

      {SidebarEl}

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* HEADER */}
        <div style={{ height: isMobile ? 52 : 54, padding: isMobile ? "0 12px" : "0 20px", borderBottom: "1px solid #e8edf3", display: "flex", alignItems: "center", gap: 10, background: "#fff", flexShrink: 0 }}>
          {isMobile && (
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 4px", position: "relative" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[0,1,2].map(i => <span key={i} style={{ display: "block", width: 20, height: 2, background: "#475569", borderRadius: 2 }} />)}
              </div>
              {totalUnread > 0 && <span style={{ position: "absolute", top: 2, right: 0, width: 8, height: 8, borderRadius: "50%", background: "#6366f1", border: "2px solid #fff" }} />}
            </button>
          )}
          {isDM ? (
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: dmMember?.color || "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>{dmMember?.avatar}</div>
              <div style={{ fontWeight: 800, fontSize: isMobile ? 13 : 14, color: "#0f172a" }}>{dmMember?.name}</div>
            </div>
          ) : (
            <div>
              {editingChName ? (
                <input
                  autoFocus
                  defaultValue={chInfo?.name}
                  onBlur={e => renameChannel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") renameChannel(e.target.value);
                    if (e.key === "Escape") setEditingChName(false);
                  }}
                  style={{
                    fontSize: isMobile ? 13 : 14, fontWeight: 800,
                    border: "none", borderBottom: "2px solid #6366f1",
                    outline: "none", background: "transparent",
                    color: "#0f172a", fontFamily: "inherit", width: 140,
                  }}
                />
              ) : (
                <div
                  onClick={() => setEditingChName(true)}
                  style={{ fontWeight: 800, fontSize: isMobile ? 13 : 14, color: "#0f172a", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                  title="タップして名前を変更">
                  <span style={{ color: "#6366f1" }}>#</span>
                  <span>{chInfo?.name}</span>
                  <span style={{ fontSize: 11, color: "#cbd5e1" }}>✏️</span>
                </div>
              )}
              {!isMobile && chInfo?.desc && <div style={{ fontSize: 11, color: "#94a3b8" }}>{chInfo.desc}</div>}
            </div>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: isMobile ? 2 : 4, alignItems: "center" }}>
            {chTasks.filter(t => !t.done).length > 0 && (
              <button onClick={() => setPanel(p => p === "task" ? null : "task")} style={{ display: "flex", alignItems: "center", gap: 4, background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#92400e" }}>
                ✅ {chTasks.filter(t => !t.done).length}
              </button>
            )}
            <button onClick={() => setPanel(p => p === "task" ? null : "task")} style={{ background: panel === "task" ? "#eef2ff" : "none", border: "none", borderRadius: 8, cursor: "pointer", fontSize: isMobile ? 13 : 13, padding: "5px 9px", color: panel === "task" ? "#6366f1" : "#64748b", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>✅ タスク</button>
            <button onClick={() => setPanel(p => p === "members" ? null : "members")} style={{ background: panel === "members" ? "#eef2ff" : "none", border: "none", borderRadius: 8, cursor: "pointer", fontSize: isMobile ? 20 : 18, padding: "5px 7px", color: panel === "members" ? "#6366f1" : "#64748b" }}>👥</button>
            <button onClick={() => setSearchOpen(true)} style={{ background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontSize: isMobile ? 20 : 18, padding: "5px 7px", color: "#64748b" }}>🔍</button>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
          {/* MESSAGES */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 10px" : "18px 22px", WebkitOverflowScrolling: "touch" }}>
              {msgs.length === 0 && (
                <div style={{ textAlign: "center", padding: "80px 20px", color: "#94a3b8" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#64748b" }}>まだメッセージがありません</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>最初のメッセージを送りましょう！</div>
                </div>
              )}
              {msgs.map((msg, idx) => {
                const isSelf = msg.uid === me.id;
                const prev = msgs[idx - 1];
                const showHeader = !prev || prev.uid !== msg.uid;
                return (
                  <div key={msg.id}
                    onMouseEnter={() => !isMobile && setHoveredMsg(msg.id)}
                    onMouseLeave={() => { if (!isMobile) { setHoveredMsg(null); setEmojiFor(null); } }}
                    style={{ display: "flex", gap: isMobile ? 9 : 11, padding: isMobile ? "2px 2px" : "2px 6px", borderRadius: 10, position: "relative", background: hoveredMsg === msg.id ? "#f8fafc" : "transparent", marginTop: showHeader ? (isMobile ? 12 : 14) : 2 }}>
                    {showHeader
                      ? <div style={{ width: isMobile ? 34 : 38, height: isMobile ? 34 : 38, borderRadius: "50%", flexShrink: 0, background: msg.color || "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 13 : 14, fontWeight: 700, color: "#fff", marginTop: 2, boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}>{msg.avatar}</div>
                      : <div style={{ width: isMobile ? 34 : 38, flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {showHeader && (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontWeight: 800, fontSize: 13, color: msg.color || "#6366f1" }}>{isSelf ? me.name : msg.name}</span>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>{msg.time}</span>
                        </div>
                      )}
                      {msg.text && <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.65, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{msg.text}</div>}
                      {msg.zoom && (
                        <a href={msg.zoom} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 14px", marginTop: 6, textDecoration: "none" }}>
                          <span style={{ fontSize: 22 }}>📹</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>Zoom会議に参加する</div>
                            <div style={{ fontSize: 11, color: "#3b82f6" }}>{msg.zoom}</div>
                          </div>
                        </a>
                      )}
                      {msg.file && <FileCard file={msg.file} />}
                      {msg.reactions.length > 0 && (
                        <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                          {msg.reactions.map((r, ri) => (
                            <button key={ri} onClick={() => react(msg.id, r.emoji)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 12, padding: isMobile ? "3px 10px" : "2px 9px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                              onMouseEnter={e => { e.currentTarget.style.background = "#eef2ff"; e.currentTarget.style.borderColor = "#6366f1"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.borderColor = "#e2e8f0"; }}>
                              {r.emoji} <span style={{ fontWeight: 700, color: "#6366f1" }}>{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* リアクションボタン非表示 */}
                      {/* 自分が送ったメッセージに既読表示 */}
                      {isSelf && idx === msgs.length - 1 && (
                        <ReadStatus channelId={activeChannel} msgId={msg.id} myId={me?.id} members={members} sentAt={msg.id} />
                      )}
                    </div>
                    {/* PCリアクションボタン非表示 */}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* INPUT */}
            <div style={{
              padding: isMobile ? "8px 10px 12px" : "10px 18px 14px",
              background: "#fff", borderTop: "1px solid #f1f5f9",
              flexShrink: 0,
              paddingBottom: isMobile ? "max(12px, env(safe-area-inset-bottom))" : "14px",
            }}>
              <div style={{ marginBottom: 6, display: "flex", gap: 4 }}>
                <input ref={fileInputRef} type="file" onChange={handleFile} style={{ display: "none" }} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar" />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="ファイル添付" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: uploading ? "#cbd5e1" : "#94a3b8", padding: "3px 5px", borderRadius: 6 }}
                  onMouseEnter={e => { if (!uploading) e.currentTarget.style.color = "#6366f1"; }}
                  onMouseLeave={e => e.currentTarget.style.color = uploading ? "#cbd5e1" : "#94a3b8"}>📎</button>
                <button onClick={sendZoom} title="Zoom会議リンクを送る" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8", padding: "3px 5px", borderRadius: 6 }}
                  onMouseEnter={e => e.currentTarget.style.color = "#3b82f6"}
                  onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}>📹</button>
                <button onClick={() => setPanel(p => p === "task" ? null : "task")} title="タスク" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8", padding: "3px 5px", borderRadius: 6 }}
                  onMouseEnter={e => e.currentTarget.style.color = "#22c55e"}
                  onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}>✅</button>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "#f8fafc", borderRadius: isMobile ? 22 : 14, border: "1.5px solid #e8edf3", padding: isMobile ? "8px 8px 8px 16px" : "8px 8px 8px 16px" }}
                onFocusCapture={e => e.currentTarget.style.borderColor = "#6366f1"}
                onBlurCapture={e => e.currentTarget.style.borderColor = "#e8edf3"}>
                <textarea ref={textareaRef} value={input}
                  onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); send(); } }}
                  placeholder={isDM ? `${dmMember?.name} にメッセージ...` : `# ${chInfo?.name || ""} にメッセージ...`}
                  rows={1}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#0f172a", fontSize: isMobile ? 16 : 14, lineHeight: 1.5, resize: "none", fontFamily: "inherit", minHeight: 24, maxHeight: 120 }}
                  onFocus={() => { if (isMobile) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 300); }} />
                <button onClick={() => send()} disabled={!input.trim() || uploading} style={{ background: input.trim() && !uploading ? "linear-gradient(135deg,#6366f1,#0ea5e9)" : "#f1f5f9", border: "none", borderRadius: isMobile ? 18 : 10, color: input.trim() && !uploading ? "#fff" : "#94a3b8", cursor: input.trim() && !uploading ? "pointer" : "default", padding: isMobile ? "8px 18px" : "7px 16px", fontSize: 13, fontWeight: 700, flexShrink: 0, boxShadow: input.trim() ? "0 2px 10px rgba(99,102,241,0.3)" : "none", transition: "all 0.15s" }}>送信</button>
              </div>
              {!isMobile && <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4, paddingLeft: 4 }}>Enter で送信　Shift+Enter で改行　📎 ファイル　📹 Zoom　✅ タスク</div>}
            </div>
          </div>

          {/* SIDE PANEL（PC） */}
          {!isMobile && (panel === "admin" ? AdminPanel : TaskPanel)}
        </div>
      </div>

      {/* SIDE PANEL（モバイル） */}
      {isMobile && (panel === "admin" ? AdminPanel : TaskPanel)}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#0f172a", color: "#fff", borderRadius: 12, padding: "10px 20px", fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 500, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {/* New Channel Modal */}
      {showNewCh && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, backdropFilter: "blur(4px)", padding: 20 }}
          onClick={() => setShowNewCh(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 18px", fontWeight: 800, fontSize: 18, color: "#0f172a" }}>チャンネルを作成</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: "1.5px solid #e8edf3", borderRadius: 10, padding: "10px 14px", marginBottom: 20 }}>
              <span style={{ color: "#6366f1", fontWeight: 700 }}>#</span>
              <input value={newChName} onChange={e => setNewChName(e.target.value)} onKeyDown={e => e.key === "Enter" && addChannel()}
                placeholder="チャンネル名" autoFocus
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#0f172a", fontSize: 15, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowNewCh(false)} style={{ background: "none", border: "1.5px solid #e8edf3", borderRadius: 10, padding: "10px 18px", color: "#64748b", cursor: "pointer", fontSize: 14 }}>キャンセル</button>
              <button onClick={addChannel} disabled={!newChName.trim()} style={{ background: newChName.trim() ? "linear-gradient(135deg,#6366f1,#0ea5e9)" : "#f1f5f9", border: "none", borderRadius: 10, padding: "10px 22px", color: newChName.trim() ? "#fff" : "#94a3b8", cursor: newChName.trim() ? "pointer" : "default", fontSize: 14, fontWeight: 700 }}>作成</button>
            </div>
          </div>
        </div>
      )}

      {/* Search Modal */}
      {searchOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", display: "flex", alignItems: isMobile ? "flex-end" : "flex-start", justifyContent: "center", paddingTop: isMobile ? 0 : 80, zIndex: 400, backdropFilter: "blur(4px)" }}
          onClick={() => setSearchOpen(false)}>
          <div style={{ background: "#fff", borderRadius: isMobile ? "20px 20px 0 0" : 16, width: "100%", maxWidth: isMobile ? "100%" : 540, overflow: "hidden", maxHeight: isMobile ? "80vh" : undefined, boxShadow: "0 -4px 40px rgba(0,0,0,0.12)" }}
            onClick={e => e.stopPropagation()}>
            {isMobile && <div style={{ width: 36, height: 4, background: "#e2e8f0", borderRadius: 2, margin: "12px auto 0" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#6366f1" }}>🔍</span>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="メッセージを検索..." autoFocus
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#0f172a", fontSize: 15, fontFamily: "inherit" }} />
              <button onClick={() => setSearchOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <div style={{ padding: "8px 12px", maxHeight: 360, overflowY: "auto" }}>
              {searchResults.length > 0 ? searchResults.map(r => (
                <div key={r.id + r.ch} onClick={() => { setActiveChannel(r.ch); setSearchOpen(false); }}
                  style={{ padding: 12, borderRadius: 10, cursor: "pointer", marginBottom: 4 }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>#{r.ch} · {r.name} · {r.time}</div>
                  <div style={{ fontSize: 14, color: "#334155" }}>{r.text}</div>
                </div>
              )) : (
                <div style={{ color: "#94a3b8", fontSize: 13, padding: "24px 12px", textAlign: "center" }}>
                  {searchQuery ? "該当するメッセージが見つかりません" : "キーワードを入力してください"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* バージョン */}
      <div style={{ position: "fixed", bottom: 4, right: 8, fontSize: 10, color: "#e2e8f0", pointerEvents: "none" }}>{APP_VERSION}</div>
    </div>
  );
}
