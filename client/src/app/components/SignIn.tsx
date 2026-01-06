import React, { useState, FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAlert } from '../contexts/AlertContext';

interface SignInProps {
  onSignIn: () => void;
  onNavigateToSignUp: () => void;
}

export function SignIn({ onSignIn, onNavigateToSignUp }: SignInProps) {
  const { showAlert } = useAlert();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(email, password, rememberDevice);
      if (result.success) {
        onSignIn();
      } else {
        setError(result.message || 'Login failed. Please check your credentials.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center px-4">
      {/* Logo/Title */}
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-12">
        RetailPro POS
      </h1>

      {/* Sign In Card */}
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Sign In
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Access your RetailPro POS account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block font-medium text-gray-900 dark:text-white mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600 transition-colors text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              required
              disabled={isLoading}
            />
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block font-medium text-gray-900 dark:text-white mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600 transition-colors pr-12 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Remember Device & Forgot Password */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Remember this device
              </span>
            </label>

            <button
              type="button"
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              onClick={() => showAlert({ message: 'Forgot password functionality would be implemented here' })}
            >
              Forgot password?
            </button>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gray-900 dark:bg-blue-600 text-white font-medium py-3.5 rounded-lg hover:bg-gray-800 dark:hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>

          {/* Register Link */}
          <div className="text-center pt-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
            </span>
            <button
              type="button"
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              onClick={onNavigateToSignUp}
            >
              Register
            </button>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
        Version 1.0.0 | <button className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors" onClick={() => showAlert({ message: 'Support functionality would be implemented here' })}>Support</button>
      </div>
    </div>
  );
}