import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// 不用 StrictMode：它会 double-invoke effects，导致 App 里的 WS 连接被
// 首次 cleanup 关掉（bootedOnceRef 挡住了第二次 open），整个 autoTick
// 就永远启不来。展台 demo 不需要 dev-only 双 mount 检查。
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
