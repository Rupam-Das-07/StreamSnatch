import React, { useState } from 'react';

const Login = ({ setActiveTab }) => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      setError('All fields are required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setSuccess('Logged in successfully!');
  };

  return (
    <div className="flex justify-center items-center w-full py-12 px-4 transition-all duration-300">
      <div className="bg-zinc-950/60 backdrop-blur-2xl border border-white/10 rounded-[24px] p-8 sm:p-10 w-full max-w-md shadow-2xl animate-fade-in-up">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-accent-cyan to-accent-magenta bg-clip-text text-transparent drop-shadow-sm">
            Welcome Back
          </h2>
          <p className="text-zinc-400 text-sm mt-2">Sign in to sync your downloads</p>
        </div>

        {error && (
          <div className="text-red-400 bg-red-500/10 p-3.5 rounded-xl text-sm font-medium mb-6 border border-red-500/20 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
            {error}
          </div>
        )}

        {success && (
          <div className="text-emerald-400 bg-emerald-500/10 p-3.5 rounded-xl text-sm font-medium mb-6 border border-emerald-500/20 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <input
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3.5 bg-black/40 text-white border border-white/10 rounded-xl text-sm outline-none focus:border-accent-cyan/50 focus:ring-2 focus:ring-accent-cyan/50 hover:bg-black/60 transition-all font-medium placeholder:text-zinc-500"
            />
          </div>
          <div>
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-3.5 bg-black/40 text-white border border-white/10 rounded-xl text-sm outline-none focus:border-accent-cyan/50 focus:ring-2 focus:ring-accent-cyan/50 hover:bg-black/60 transition-all font-medium placeholder:text-zinc-500"
            />
          </div>

          <button
            type="submit"
            className="w-full mt-2 py-4 rounded-xl text-base font-bold bg-gradient-to-r from-accent-cyan to-accent-magenta text-white hover:opacity-90 active:scale-[0.98] shadow-lg hover:shadow-cyan-500/20 transition-all duration-300"
          >
            Login
          </button>
        </form>

        <div className="flex items-center my-6">
          <div className="flex-grow border-t border-white/10"></div>
          <span className="px-4 text-xs font-semibold text-zinc-500 tracking-wide uppercase">or continue with</span>
          <div className="flex-grow border-t border-white/10"></div>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            type="button"
            onClick={() => console.log('Continue with Google')}
            className="flex items-center justify-center gap-3 w-full py-3 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-white border border-white/10 rounded-xl text-sm font-semibold transition-all duration-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          
          <button 
            type="button"
            onClick={() => console.log('Continue with GitHub')}
            className="flex items-center justify-center gap-3 w-full py-3 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-white border border-white/10 rounded-xl text-sm font-semibold transition-all duration-200"
          >
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            Continue with GitHub
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-zinc-400">
          Don't have an account?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('signup'); }} className="text-accent-cyan font-semibold hover:text-cyan-400 hover:underline underline-offset-4 transition-all">
            Sign up for free
          </a>
        </p>
      </div>
    </div>
  );
};

export default Login;
