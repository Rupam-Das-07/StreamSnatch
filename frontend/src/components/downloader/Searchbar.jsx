import React, { useState, useEffect } from 'react';

function DynamicHeading({ url }) {
  const [wordIndex, setWordIndex] = useState(0);
  const [text, setText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(150);
  const words = ["Any Video", "Reels", "Shorts"];

  useEffect(() => {
    // If a URL is entered, pause the animation
    if (url) return;

    const handleTyping = () => {
      const currentWord = words[wordIndex];
      
      if (isDeleting) {
        setText(currentWord.substring(0, text.length - 1));
        setTypingSpeed(50); // Faster when deleting
      } else {
        setText(currentWord.substring(0, text.length + 1));
        setTypingSpeed(100); // Normal typing speed
      }

      if (!isDeleting && text === currentWord) {
        // Pause at the end of the word before deleting
        setTypingSpeed(1500);
        setIsDeleting(true);
      } else if (isDeleting && text === "") {
        // Switch to the next word and pause briefly before typing
        setIsDeleting(false);
        setWordIndex((prev) => (prev + 1) % words.length);
        setTypingSpeed(500);
      }
    };

    const timeout = setTimeout(handleTyping, typingSpeed);
    return () => clearTimeout(timeout);
  }, [text, isDeleting, wordIndex, typingSpeed, url]);

  let platform = url ? "" : text;
  
  if (url) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) platform = "YouTube Video";
    else if (lowerUrl.includes("instagram.com")) platform = "Instagram Reel";
    else if (lowerUrl.includes("facebook.com") || lowerUrl.includes("fb.watch")) platform = "Facebook Video";
    else platform = "Any Video";
  }

  return (
    <h1 className="text-5xl md:text-6xl lg:text-[72px] font-extrabold tracking-tight mb-10 text-center leading-tight">
      Download{" "}
      <span className="bg-gradient-to-r from-accent-cyan to-accent-magenta bg-clip-text text-transparent drop-shadow-sm">
        {platform}
      </span>
      {!url && <span className="animate-pulse ml-1 text-zinc-500 font-light opacity-60">|</span>}
    </h1>
  );
}

function Searchbar({ url, setUrl, handleFetchDetails, loading, currentTheme, theme }) {
  return (
    <div className="relative w-full max-w-4xl text-center mx-auto transition-all duration-300 py-10">
      {/* Background Animated Orbs */}
      <div className="absolute top-0 left-[10%] w-64 md:w-96 h-64 md:h-96 bg-accent-cyan/30 rounded-full mix-blend-screen filter blur-[100px] opacity-60 animate-pulse" style={{ animationDuration: '6s', zIndex: 0 }}></div>
      <div className="absolute bottom-0 right-[10%] w-64 md:w-96 h-64 md:h-96 bg-accent-magenta/30 rounded-full mix-blend-screen filter blur-[100px] opacity-60 animate-pulse" style={{ animationDuration: '8s', animationDelay: '2s', zIndex: 0 }}></div>

      <div className="relative z-10 max-w-3xl mx-auto w-full">
        <DynamicHeading url={url} />

        <div 
        className={`flex w-full items-center p-2 rounded-2xl shadow-2xl transition-all duration-300 border focus-within:ring-2 focus-within:ring-accent-cyan/40 hover:shadow-cyan-500/10 ${
          theme === 'dark' 
            ? 'bg-zinc-900/60 border-white/10 hover:border-white/20 backdrop-blur-xl' 
            : 'bg-white/80 border-black/5 hover:border-black/10 backdrop-blur-xl'
        }`}
      >
        <div className="pl-4 pr-2 text-zinc-400">
          <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste YouTube, Instagram, or Facebook link..."
          className={`w-full flex-grow bg-transparent border-none focus:outline-none focus:ring-0 text-base md:text-lg py-3 placeholder:text-zinc-500 ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}
        />
        
        <button
          onClick={handleFetchDetails}
          disabled={loading}
          className="bg-gradient-to-r from-accent-cyan to-accent-magenta hover:opacity-90 active:scale-[0.98] text-white font-semibold px-6 md:px-8 py-3.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md ml-2 shrink-0 leading-none"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
    </div>
    </div>
  );
}

export default Searchbar;