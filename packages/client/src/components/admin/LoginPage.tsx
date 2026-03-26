import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/auth.store';
import { apiPost, ApiError } from '../../lib/api';
import { Button, Input, Card } from '../ui';

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const result = await apiPost<{ token: string }>('auth/login', data);
      login(result.token);
      navigate('/');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Ошибка входа';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">Вход</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            {...register('email', { required: 'Введите email' })}
            error={errors.email?.message}
          />
          <Input
            label="Пароль"
            type="password"
            {...register('password', { required: 'Введите пароль' })}
            error={errors.password?.message}
          />
          <Button type="submit" loading={loading} className="w-full">
            Войти
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          Нет аккаунта?{' '}
          <Link to="/register" className="text-primary-600 hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </Card>
    </div>
  );
}
