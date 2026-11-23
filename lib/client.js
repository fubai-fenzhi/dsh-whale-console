/**
 * dsh-whale-console —— 客户端半边：DSH 设置里的「鲸鱼娘控制台」卡片。
 * 数据流：本组件 ⇄ /dsh-whale-console/api/*（同源 fetch）⇄ 宿主侧脚本。
 */
window.__ModuleLoader__.load({
  id: 'dsh-whale-console',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');
    const { createElement: h, useState, useEffect, useCallback } = React;

    const API = '/dsh-whale-console/api';
    const GREEN = '#2ecc71';
    const GREY = '#666';
    const DEFAULT_PORTS = { voice: 8765, gsv: 9880, llama: 8080, ollama: 11434 };

    function dot(on) {
      return h('span', { style: { display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', background: on ? GREEN : GREY, marginRight: '8px' } });
    }

    function row(label, on) {
      return h('div', { style: { display: 'flex', alignItems: 'center', padding: '4px 0', fontSize: '13px' } },
        dot(on),
        h('span', { style: { width: '150px', opacity: 0.72 } }, label),
        h('b', { style: { color: on ? GREEN : '#888', fontWeight: 600 } }, on ? '运行中' : '已关闭'),
      );
    }

    function btn(label, action, background, busy, disabled, onAct) {
      const blocked = !!busy || !!disabled;
      return h('button', {
        disabled: blocked,
        onClick: () => onAct(action),
        style: {
          padding: '9px 14px', margin: '4px 8px 4px 0', borderRadius: '8px',
          border: '1px solid #3a3a3a', background: blocked ? '#2a2a2a' : background,
          color: '#fff', cursor: blocked ? 'default' : 'pointer', fontSize: '13px',
        },
      }, label);
    }

    function ConsoleSection() {
      const [status, setStatus] = useState({ pet: false, voice: false, gsv: false, llama: false, ollama: false });
      const [configured, setConfigured] = useState(null);
      const [ports, setPorts] = useState(DEFAULT_PORTS);
      const [loadError, setLoadError] = useState('');
      const [busy, setBusy] = useState('');
      const [message, setMessage] = useState('');

      const load = useCallback(async () => {
        try {
          const response = await fetch(API + '/status');
          const data = await response.json();
          if (data && data.ok) {
            setStatus(data.status);
            setConfigured(data.configured !== false);
            if (data.ports) setPorts({ ...DEFAULT_PORTS, ...data.ports });
            setLoadError('');
          } else {
            setLoadError('状态接口返回错误');
          }
        } catch {
          setLoadError('无法读取状态');
        }
      }, []);

      useEffect(() => {
        load();
        const timer = setInterval(load, 4000);
        return () => clearInterval(timer);
      }, [load]);

      const act = useCallback(async (action) => {
        setBusy(action);
        setMessage('');
        try {
          const response = await fetch(API + '/' + action, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
          const data = await response.json();
          if (data && data.ok) setMessage('已触发：' + action);
          else setMessage('失败：' + ((data && data.result && data.result.error) || (data && data.error) || ''));
        } catch (error) {
          setMessage('请求失败：' + String(error && error.message || error));
        }
        setBusy('');
        setTimeout(load, 1800);
      }, [load]);

      const unconfigured = configured === false;

      return h('div', { style: { padding: '4px 2px 12px' } },
        unconfigured
          ? h('div', { style: { marginBottom: '8px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(240,180,41,.12)', border: '1px solid rgba(240,180,41,.4)', fontSize: '12px', color: '#f0b429' } },
            '未配置 scriptsDir：在插件配置里设置脚本目录并重启 DSH 后，按钮才会生效')
          : null,
        loadError ? h('div', { style: { marginBottom: '8px', fontSize: '12px', color: '#e74c3c' } }, loadError) : null,
        h('div', { style: { marginBottom: '8px', opacity: 0.75, fontSize: '12px' } }, '一键管理本地服务；状态每 4 秒自动刷新。'),
        row('桌宠（鲸鱼娘）', status.pet),
        row('语音服务（' + ports.voice + '）', status.voice),
        row('语音引擎（' + ports.gsv + '）', status.gsv),
        row('本地模型（' + ports.llama + '）', status.llama),
        row('Ollama（' + ports.ollama + '）', status.ollama),
        h('div', { style: { marginTop: '12px' } },
          btn('一键启动（桌宠+语音）', 'start', '#2563eb', busy, unconfigured, act),
          btn('一键关闭', 'stop', '#b3261e', busy, unconfigured, act),
          btn('只开语音', 'voice', '#2f6f4f', busy, unconfigured, act),
          btn('只开本地模型', 'model', '#5b4a8f', busy, unconfigured, act),
        ),
        message ? h('div', { style: { marginTop: '10px', fontSize: '12px', color: '#f0b429' } }, message) : null,
      );
    }

    function apply(ctx) {
      ctx.effect(
        () => ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'whale-console', order: 7, label: () => '鲸鱼娘控制台' },
            ConsoleSection,
          ),
          'whale-console: settings section',
        ),
        'whale-console: settings section',
      );
    }

    exports.apply = apply;
    exports.inject = ['slots'];
    exports.ConsoleSection = ConsoleSection;
    return module.exports;
  },
});
