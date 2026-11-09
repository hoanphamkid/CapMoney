import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, LoaderCircle, Mail, UserRound } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../services/api';

const authSchema = z.object({ name: z.string(), email: z.string().email('Nhập email hợp lệ'), password: z.string(), confirmPassword: z.string(), remember: z.boolean(), agree: z.boolean() }).superRefine((value, context) => { if (value.password.length < 1) context.addIssue({ code: 'custom', path: ['password'], message: 'Nhập mật khẩu' }); if (value.name && value.name.trim().length < 2) context.addIssue({ code: 'custom', path: ['name'], message: 'Tên cần ít nhất 2 ký tự' }); if (value.name && value.password.length < 8) context.addIssue({ code: 'custom', path: ['password'], message: 'Mật khẩu cần ít nhất 8 ký tự' }); if (value.name && value.password !== value.confirmPassword) context.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Mật khẩu chưa trùng khớp' }); if (value.name && !value.agree) context.addIssue({ code: 'custom', path: ['agree'], message: 'Bạn cần đồng ý với điều khoản' }); });
type FormValues = z.infer<typeof authSchema>;

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const isLogin = mode === 'login';
  const form = useForm<FormValues>({ resolver: zodResolver(authSchema), defaultValues: { name: '', email: '', password: '', confirmPassword: '', remember: true, agree: true } });
  const submit = async (values: FormValues) => {
    setError(''); setSuccess('');
    try {
      if (isLogin) await login({ email: values.email, password: values.password, remember: values.remember });
      else { const result = await register({ name: values.name, email: values.email, password: values.password }); setSuccess(`Chào mừng ${result.name.split(' ')[0]}, tài khoản của bạn đã sẵn sàng.`); }
      navigate((location.state as { from?: string } | null)?.from ?? '/app', { replace: true });
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Không thể kết nối. Vui lòng thử lại.'); }
  };

  const handleSubmit = (event: FormEvent) => { void form.handleSubmit(submit)(event); };
  const fieldError = (name: string) => (form.formState.errors as Record<string, { message?: string }>)[name]?.message;
  return <div className="auth-form-wrap">
    <div className="auth-heading"><p className="auth-kicker">{isLogin ? 'CHÀO MỪNG TRỞ LẠI' : 'BẮT ĐẦU HÀNH TRÌNH'}</p><h2>{isLogin ? 'Mừng bạn trở lại.' : 'Tạo không gian riêng.'}</h2><p>{isLogin ? 'Đăng nhập để tiếp tục quản lý những điều quan trọng.' : 'Một tài khoản nhỏ, một bước tiến lớn cho tương lai của bạn.'}</p></div>
    <div className="auth-tabs"><Link className={isLogin ? 'active' : ''} to="/login">Đăng nhập</Link><Link className={!isLogin ? 'active' : ''} to="/register">Tạo tài khoản</Link></div>
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {!isLogin && <Field label="Tên của bạn" icon={<UserRound size={17} />} error={fieldError('name')}><input {...form.register('name')} placeholder="Nguyễn Minh Anh" autoComplete="name" /></Field>}
      <Field label="Email" icon={<Mail size={17} />} error={fieldError('email')}><input {...form.register('email')} type="email" placeholder="ban@email.com" autoComplete="email" /></Field>
      <Field label="Mật khẩu" error={fieldError('password')} hint={!isLogin ? 'Ít nhất 8 ký tự' : undefined}><div className="password-field"><input {...form.register('password')} type={showPassword ? 'text' : 'password'} placeholder="••••••••" autoComplete={isLogin ? 'current-password' : 'new-password'} /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>
      {!isLogin && <Field label="Nhập lại mật khẩu" error={fieldError('confirmPassword')}><input {...form.register('confirmPassword')} type={showPassword ? 'text' : 'password'} placeholder="••••••••" autoComplete="new-password" /></Field>}
      {isLogin ? <div className="form-row"><label className="checkbox-label"><input {...form.register('remember')} type="checkbox" /><span>Ghi nhớ đăng nhập</span></label><button type="button" className="text-button" onClick={() => setSuccess('Liên kết đặt lại mật khẩu sẽ được gửi tới email của bạn.')}>Quên mật khẩu?</button></div> : <label className="checkbox-label terms"><input {...form.register('agree')} type="checkbox" /><span>Tôi đồng ý với <button type="button" className="inline-link">Điều khoản sử dụng</button> và <button type="button" className="inline-link">Chính sách riêng tư</button>.</span></label>}
      {error && <div className="form-alert error">{error}</div>}{success && <div className="form-alert success">{success}</div>}
      <button className="submit-button" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <LoaderCircle size={18} className="spin" /> : <>{isLogin ? 'Đăng nhập' : 'Tạo tài khoản'}<ArrowRight size={17} /></>}</button>
    </form>
    <p className="switch-prompt">{isLogin ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'} <Link to={isLogin ? '/register' : '/login'}>{isLogin ? 'Tạo tài khoản' : 'Đăng nhập'}</Link></p>
  </div>;
}

function Field({ label, icon, error, hint, children }: { label: string; icon?: ReactNode; error?: string; hint?: string; children: ReactNode }) { return <label className={`form-field ${error ? 'has-error' : ''}`}><span className="field-label">{label}{hint && <small>{hint}</small>}</span><span className="field-control">{icon && <span className="field-icon">{icon}</span>}{children}</span>{error && <small className="field-error">{error}</small>}</label>; }
