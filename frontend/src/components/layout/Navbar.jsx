import { useState } from 'react';
import ThemeToggle from '../ui/ThemeToggle';
import HamburgerMenu from './HamburgerMenu';
import RainbowButton from '../ui/RainbowButton';

function Navbar({ theme, toggleTheme, activeTab, setActiveTab }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { id: 'downloader', text: 'Downloader' },
    { id: 'converter', text: 'Converter' },
  ];

  const navbarThemeClasses = {
    dark: 'bg-black/20 backdrop-blur-2xl border-b border-white/10 text-white',
    light: 'bg-white/50 backdrop-blur-2xl border-b border-black/5 text-black shadow-sm',
  };
  
  const linkThemeClasses = {
    dark: 'text-zinc-400 hover:text-white',
    light: 'text-zinc-500 hover:text-black',
  };

  return (
    <div>
      <nav className={`fixed w-full top-0 z-50 transition-colors duration-300 ${navbarThemeClasses[theme]}`}>
        <div className="flex justify-between items-center px-6 h-20 max-w-7xl mx-auto">
          <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab?.('downloader'); }} className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-accent-cyan to-accent-magenta bg-clip-text text-transparent hover:opacity-80 transition-opacity duration-300">
            StreamSnatch
          </a>

          <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="flex items-center space-x-2">
              {navLinks.map((link) => (
                <button 
                  key={link.id} 
                  onClick={() => setActiveTab?.(link.id)} 
                  className={`text-sm font-semibold px-5 py-2 rounded-full transition-all duration-300 ${activeTab === link.id ? (theme === 'dark' ? 'bg-white/10 text-white shadow-sm' : 'bg-black/5 text-black shadow-sm') : linkThemeClasses[theme]}`}
                >
                  {link.text}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <ThemeToggle toggleTheme={toggleTheme} theme={theme} />
            <div className="hidden md:flex items-center space-x-2">
              <RainbowButton label="Sign In" theme={theme} fullWidth={false} onClick={() => setActiveTab?.('login')} />
              <RainbowButton label="Sign Up" theme={theme} fullWidth={false} onClick={() => setActiveTab?.('signup')} />
            </div>
            <div className="md:hidden">
              <HamburgerMenu 
                isOpen={isMenuOpen} 
                toggleMenu={() => setIsMenuOpen(!isMenuOpen)} 
                theme={theme}
              />
            </div>
          </div>
        </div>
      </nav>

      <div 
        className={`md:hidden fixed top-0 right-0 h-full w-64 z-50 p-8 border-l ${theme === 'dark' ? 'border-white/5' : 'border-black/5'} transition-transform duration-300 ease-in-out ${navbarThemeClasses[theme]} ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex justify-end mb-8">
           <button onClick={() => setIsMenuOpen(false)} className={`p-2 rounded-full ${theme === 'dark' ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-black/5 text-black hover:bg-black/10'} transition-colors`}>
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
           </button>
        </div>
        <div className="flex flex-col space-y-2">
          {navLinks.map((link) => (
             <button 
               key={link.id} 
               onClick={() => { setActiveTab?.(link.id); setIsMenuOpen(false); }} 
               className={`text-lg text-left font-medium px-4 py-3 rounded-xl transition-all ${activeTab === link.id ? (theme === 'dark' ? 'bg-white/10 text-white' : 'bg-black/5 text-black') : linkThemeClasses[theme]}`}
             >
               {link.text}
             </button>
          ))}
          <div className="pt-8 flex flex-col items-center space-y-4">
            <RainbowButton label="Sign In" theme={theme} fullWidth={true} onClick={() => { setActiveTab?.('login'); setIsMenuOpen(false); }} />
            <RainbowButton label="Sign Up" theme={theme} fullWidth={true} onClick={() => { setActiveTab?.('signup'); setIsMenuOpen(false); }} />
          </div>
        </div>
      </div>
      
      {/* Mobile backdrop */}
      {isMenuOpen && (
        <div 
           className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
           onClick={() => setIsMenuOpen(false)}
        />
      )}
    </div>
  );
}

export default Navbar;