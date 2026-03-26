import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/auth.store';
import { apiPost, ApiError } from '../../lib/api';
import { Button, Input, Card } from '../ui';

interface RegisterForm {
  name: string;
  email: string;
  password: string;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>();

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    try {
      const result = await apiPost<{ token: string }>('auth/register', data);
      login(result.token);
      navigate('/');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Ошибка регистрации';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">Регистрация</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Имя"
            {...register('name', { required: 'Введите имя' })}
            error={errors.name?.message}
          />
          <Input
            label="Email"
            type="email"
            {...register('email', { required: 'Введите email' })}
            error={errors.email?.message}
          />
          <Input
            label="Пароль"
            type="password"
            {...register('password', {
              required: 'Введите пароль',
              minLength: { value: 6, message: 'Минимум 6 символов' },
            })}
            error={errors.password?.message}
          />
          <Button type="submit" loading={loading} className="w-full">
            Зарегистрироваться
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="text-primary-600 hover:underline">
            Войти
          </Link>
        </p>
      </Card>
    </div>
  );
}
