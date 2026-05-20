import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('密码至少需要 6 位');
      return;
    }

    setSubmitting(true);
    try {
      let user;
      if (mode === 'login') {
        user = await login(account, password);
      } else {
        user = await register(account, password);
      }
      navigate(user.hasSubmission ? '/map' : '/map?create=true');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message ?? '操作失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center overflow-hidden" style={{ minHeight: '100dvh' }}>
      {/* Map background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/maps/map-zgc-web.jpg')" }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Back pill */}
      <Link
        to="/"
        className="glass-pill absolute top-5 left-5 z-10"
      >
        ← 返回
      </Link>

      {/* Glass card */}
      <div className="relative z-10 glass-panel rounded-[24px] px-10 py-12 w-full max-w-[380px] mx-4">
        {/* Mode toggle */}
        <div className="flex justify-center gap-6 mb-8">
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className="text-[15px] font-semibold transition-colors py-2 min-h-[44px]"
            style={{ color: mode === 'login' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
          >
            登录
          </button>
          <button
            onClick={() => { setMode('register'); setError(''); }}
            className="text-[15px] font-semibold transition-colors py-2 min-h-[44px]"
            style={{ color: mode === 'register' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
          >
            注册
          </button>
        </div>

        {mode === 'register' && (
          <p
            className="text-[13px] text-center mb-6 -mt-4"
            style={{ color: 'var(--text-tertiary)' }}
          >
            注册后，你的用户名会显示在发布的作品旁
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-[13px] mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              登录账号
            </label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
              className="glass-input w-full"
              placeholder="输入登录账号"
            />
          </div>

          <div>
            <label
              className="block text-[13px] mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="glass-input w-full"
              placeholder="至少 6 位"
            />
          </div>

          {error && (
            <p className="text-[13px] text-red-400/80">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full mt-2"
          >
            {submitting ? '请稍候...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>
      </div>
    </div>
  );
}
