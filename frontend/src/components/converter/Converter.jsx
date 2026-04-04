import React, { useState } from 'react';
import { BASE_URL } from '../../config';

const Converter = () => {
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState('mp4');
  const [status, setStatus] = useState('Waiting...');
  const [errorMessage, setErrorMessage] = useState('');

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (e) => {
    setErrorMessage('');
    const selectedFile = e.target.files[0];
    
    if (selectedFile) {
      if (selectedFile.size > 100 * 1024 * 1024) {
        setErrorMessage('File size limit exceeded. Please upload a file smaller than 100MB.');
        setFile(null);
        e.target.value = null;
        return;
      }
      setFile(selectedFile);
      setStatus('Waiting...');
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setStatus('Uploading...');
    setErrorMessage('');

    // Simulate upload progress transition to keep it simple
    const uploadTimer = setTimeout(() => {
      setStatus('Converting...');
    }, 1500);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);

    try {
      const response = await fetch(`${BASE_URL}/api/convert`, {
        method: 'POST',
        body: formData,
      });

      clearTimeout(uploadTimer);

      if (!response.ok) {
        throw new Error('Server rejected the conversion request.');
      }

      setStatus('Done');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const originalName = file.name.split('.')[0] || 'converted_file';
      a.download = `${originalName}.${format}`;
      
      document.body.appendChild(a);
      a.click();
      
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      clearTimeout(uploadTimer);
      console.error(error);
      setStatus('Error');
      setErrorMessage(error.message || 'Something went wrong during the conversion.');
    }
  };

  return (
    <div className="flex justify-center items-center w-full py-12 px-4 transition-all duration-300">
      <div className="bg-zinc-950/60 backdrop-blur-2xl border border-white/10 rounded-[24px] p-8 sm:p-10 w-full max-w-lg shadow-2xl hover:shadow-accent-cyan/10 transition-shadow">
        <h2 className="m-0 text-3xl font-extrabold tracking-tight bg-gradient-to-r from-accent-cyan to-accent-magenta bg-clip-text text-transparent drop-shadow-sm">
          File Converter
        </h2>
        <p className="text-zinc-400 text-sm mt-2 mb-8">
          Convert your local media files instantly.
        </p>

        <div className="mb-6 w-full flex flex-col gap-3 p-3 bg-black/30 rounded-2xl border border-white/5 shadow-inner">
          <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-40 border-[1.5px] border-dashed border-white/10 rounded-xl cursor-pointer hover:border-accent-cyan/50 hover:bg-accent-cyan/5 transition-all group duration-300">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg className="w-12 h-12 mb-3 text-zinc-500 group-hover:text-accent-cyan group-hover:scale-110 transition-all duration-300" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 10V9C7 6.23858 9.23858 4 12 4C14.7614 4 17 6.23858 17 9V10C19.2091 10 21 11.7909 21 14C21 15.4806 20.1956 16.8084 19 17.5M7 10C4.79086 10 3 11.7909 3 14C3 15.4806 3.8044 16.8084 5 17.5M7 10C7.43285 10 7.84965 10.0688 8.24006 10.1959M12 12V21M12 12L15 15M12 12L9 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="mb-2 text-sm text-zinc-400 font-medium group-hover:text-white transition-colors">Browse file to upload</p>
              <p className="text-xs text-zinc-600">Max size: 100 MB</p>
            </div>
            <input 
              id="file-upload" 
              type="file" 
              className="hidden" 
              onChange={handleFileChange}
            />
          </label>

          <div className="flex items-center justify-between w-full p-3 bg-white/5 rounded-xl border border-white/10 backdrop-blur-md">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-2.5 bg-black/40 rounded-lg shrink-0 shadow-sm border border-white/5 text-accent-cyan">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15.331 6H8.5v20h15V14.154h-8.169z" />
                  <path d="M18.153 6h-.009v5.342H23.5v-.002z" />
                </svg> 
              </div>
              <div className="flex flex-col overflow-hidden">
                <p className={`text-sm tracking-tight truncate font-medium ${file ? 'text-zinc-200' : 'text-zinc-500'}`}>
                  {file ? file.name : "No file selected"}
                </p>
                {file && (
                  <p className="text-xs text-zinc-500 truncate mt-0.5">
                    {formatFileSize(file.size)}
                  </p>
                )}
              </div>
            </div>
            <button 
              type="button"
              onClick={() => { if(file) { setFile(null); document.getElementById('file-upload').value = null; } }}
              className={`p-2 rounded-lg transition-all ${file ? 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-700 cursor-not-allowed'}`}
              disabled={!file}
              title={file ? "Remove file" : ""}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.16565 10.1534C5.07629 8.99181 5.99473 8 7.15975 8H16.8402C18.0053 8 18.9237 8.9918 18.8344 10.1534L18.142 19.1534C18.0619 20.1954 17.193 21 16.1479 21H7.85206C6.80699 21 5.93811 20.1954 5.85795 19.1534L5.16565 10.1534Z" stroke="currentColor" strokeWidth={1.5} /> 
                <path d="M19.5 5H4.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /> 
                <path d="M10 3C10 2.44772 10.4477 2 11 2H13C13.5523 2 14 2.44772 14 3V5H10V3Z" stroke="currentColor" strokeWidth={1.5} />
              </svg>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="text-red-400 bg-red-500/10 p-3.5 rounded-xl text-sm font-medium mb-6 border border-red-500/20">
            {errorMessage}
          </div>
        )}

        <div className="mb-6 relative">
          <select 
            value={format} 
            onChange={(e) => setFormat(e.target.value)}
            className="w-full px-4 py-3.5 bg-black/40 text-white border border-white/10 rounded-xl text-sm outline-none cursor-pointer appearance-none hover:bg-black/60 focus:ring-2 focus:ring-accent-cyan/50 focus:border-accent-cyan/50 transition-all font-medium"
          >
            <option value="mp4" className="bg-zinc-900">MP4 Video</option>
            <option value="mp3" className="bg-zinc-900">MP3 Audio</option>
            <option value="mkv" className="bg-zinc-900">MKV Video</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-zinc-400">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
            </svg>
          </div>
        </div>

        <button 
          onClick={handleConvert}
          disabled={!file || status === 'Uploading...' || status === 'Converting...'}
          className={`w-full py-4 rounded-xl text-base font-bold transition-all duration-300 flex justify-center items-center gap-2 ${
            !file || status === 'Uploading...' || status === 'Converting...' 
              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60' 
              : 'bg-gradient-to-r from-accent-cyan to-accent-magenta text-white hover:opacity-90 active:scale-[0.98] shadow-lg hover:shadow-cyan-500/20'
          }`}
        >
          {(status === 'Uploading...' || status === 'Converting...') && (
            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-current opacity-70" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {status === 'Uploading...' || status === 'Converting...' ? 'Converting...' : 'Convert'}
        </button>

        <div className="mt-8 text-center text-sm">
          <span className="text-zinc-500">Processing Status: </span>
          <span className="text-zinc-300 font-medium ml-1 bg-white/5 px-2 py-1 rounded-md border border-white/5">{status}</span>
        </div>
      </div>
    </div>
  );
};

export default Converter;
