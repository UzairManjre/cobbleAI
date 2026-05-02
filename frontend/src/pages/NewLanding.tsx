import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, GraduationCap, Cloud, Bell, X } from 'lucide-react';

export default function NewLanding() {
  const navigate = useNavigate();

  const handleStart = () => navigate('/role-select');

  // Animation variants
  const drawPath = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: { 
      pathLength: 1, 
      opacity: 1, 
      transition: { pathLength: { delay: 0.3, type: "spring", duration: 1.5, bounce: 0 }, opacity: { delay: 0.3, duration: 0.1 } } 
    }
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2 }
    }
  };

  return (
    <div 
      className="bg-[#fcfcfc] text-black selection:bg-[#ff5c5c] selection:text-white overflow-x-hidden"
      style={{ fontFamily: "'Outfit', sans-serif", fontWeight: "inherit" }}
    >
      
      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#fcfcfc]/90 backdrop-blur-md flex items-center justify-between px-8 md:px-16 py-4 border-b border-black/5">
        <h1 className="text-2xl font-bold tracking-tight">Cobble</h1>
        <nav className="hidden md:flex items-center gap-8 text-[15px] font-semibold text-black/80">
          <a href="#about" className="hover:text-[#ff5c5c] transition-colors">About us</a>
          <span className="text-black/20">|</span>
          <a href="#how" className="hover:text-[#ff5c5c] transition-colors">How it Works</a>
        </nav>
        <button onClick={handleStart} className="bg-[#ff5c5c] text-white px-6 py-2.5 rounded-full text-[15px] font-semibold hover:bg-[#ff4444] transition-all hover:shadow-lg hover:shadow-[#ff5c5c]/30">
          Start Now
        </button>
      </header>

      {/* HERO SECTION */}
      <section className="min-h-screen relative flex flex-col items-center justify-center pt-20 px-6 max-w-4xl mx-auto text-center">
        <div className="relative">
          {/* Clean Looped Top Arrow */}
          <motion.svg style={{ overflow: 'visible' }} width="100" height="100" viewBox="0 0 100 100" fill="none" className="absolute -top-24 -right-4 text-[#ff5c5c] hidden md:block" initial="hidden" whileInView="visible" viewport={{ once: true }}>
            {/* Loop path */}
            <motion.path d="M 90 90 C 90 50, 70 30, 50 30 C 30 30, 20 45, 30 60 C 40 75, 60 70, 50 50 C 40 30, 20 50, 10 70" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" variants={drawPath}/>
            {/* Arrow head */}
            <motion.path d="M 25 65 L 10 70 L 15 55" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" variants={drawPath}/>
          </motion.svg>

          {/* Sparkles (Left side) */}
          <motion.div className="absolute top-10 -left-20 text-[#ff5c5c] hidden md:flex flex-col items-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
             <Sparkles className="w-12 h-12 mb-2" strokeWidth={1.5} />
             <Sparkles className="w-8 h-8 -ml-8" strokeWidth={1.5} />
          </motion.div>

          <motion.h2 className="text-7xl md:text-[9rem] font-extrabold tracking-tight mb-8 leading-[0.9]" style={{ fontFamily: "'Outfit', sans-serif" }} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            COBBLE
            <br />
            AI
          </motion.h2>
        </div>

        <motion.div className="relative mb-16" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <p className="text-xl md:text-2xl font-medium font-mono text-black/80">
            Your new classmate just<br/>got a new upgrade
          </p>
          <motion.svg width="300" height="30" viewBox="0 0 300 30" fill="none" className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[#ff5c5c]">
            <motion.path d="M 10 15 Q 150 0, 290 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" variants={drawPath}/>
            <motion.path d="M 30 22 Q 150 10, 270 25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" variants={drawPath}/>
          </motion.svg>
        </motion.div>

        <motion.div className="flex flex-col sm:flex-row gap-6 mt-8" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <button onClick={() => navigate('/signup/student')} className="bg-[#ff5c5c] text-white px-10 py-4 rounded-full text-xl font-semibold hover:bg-[#ff4444] transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#ff5c5c]/20">
            Join a Class
          </button>
          <button onClick={() => navigate('/signup/professor')} className="bg-[#ff5c5c] text-white px-10 py-4 rounded-full text-xl font-semibold hover:bg-[#ff4444] transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#ff5c5c]/20">
            Create a Class
          </button>
        </motion.div>
      </section>

      {/* WHY COBBLE AI */}
      <section className="min-h-screen flex flex-col justify-center py-20 px-6 max-w-7xl mx-auto w-full">
        <motion.div className="flex flex-col lg:flex-row items-center gap-16" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={staggerContainer}>
          <motion.div className="lg:w-1/3 relative" variants={fadeUp}>
            <div className="flex flex-col">
              <Sparkles className="text-[#ff5c5c] w-12 h-12 mb-4" strokeWidth={1.5} />
              <h2 className="text-6xl md:text-[6rem] font-bold tracking-tight mb-8 leading-[0.9]">WHY<br/>COBBLE AI?</h2>
            </div>
            {/* Loop Underline */}
            <motion.svg style={{ overflow: 'visible' }} width="350" height="80" viewBox="0 0 350 80" fill="none" className="absolute -bottom-12 left-10 text-[#ff5c5c] hidden lg:block">
              <motion.path d="M 20 80 Q 140 120, 260 70 C 320 30, 270 0, 270 50 C 270 80, 300 60, 320 40" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" variants={drawPath}/>
            </motion.svg>
          </motion.div>

          <motion.div className="lg:w-2/3 w-full relative" variants={fadeUp}>
            <div className="border-[5px] border-[#ff5c5c] rounded-3xl p-8 md:p-12 bg-white relative z-10 shadow-sm" style={{ borderBottomRightRadius: '40px' }}>
              <div className="absolute top-4 right-4 flex gap-2">
                  <div className="w-7 h-7 rounded-sm border-[3px] border-[#ff5c5c] flex items-center justify-center">
                    <div className="w-3.5 h-[3px] bg-[#ff5c5c] translate-y-1 rounded-full" />
                  </div>
                  <div className="w-7 h-7 rounded-sm border-[3px] border-[#ff5c5c] flex flex-col">
                    <div className="w-full h-2 border-b-[3px] border-[#ff5c5c]" />
                  </div>
                  <div className="w-7 h-7 rounded-sm border-[3px] border-[#ff5c5c] flex items-center justify-center">
                    <X size={18} className="text-[#ff5c5c]" strokeWidth={4} />
                  </div>
              </div>
              <div className="mt-12 space-y-10 font-mono text-base md:text-lg text-black/80">
                <p><span className="font-bold text-black">• The Problem:</span> Generic AI often gives flat, out-of-context answers that don't match your course material.</p>
                <p><span className="font-bold text-black">• The Solution:</span> Cobble extracts the specific tone and knowledge from your professor's actual course notes.</p>
                <p><span className="font-bold text-black">• The Result:</span> You get a 24/7 tutor that explains concepts exactly the way they'll appear on your exam.</p>
              </div>
            </div>
            <div className="absolute top-3 left-3 right-[-12px] bottom-[-12px] border-[5px] border-[#ff5c5c]/20 rounded-3xl z-0 pointer-events-none" style={{ borderBottomRightRadius: '40px' }}></div>
          </motion.div>
        </motion.div>
      </section>

      {/* THIS MONTH'S HIGHLIGHTS */}
      <section className="min-h-screen flex flex-col justify-center py-24 px-6 max-w-7xl mx-auto w-full">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerContainer}>
          <motion.div className="flex flex-col items-center mb-20 relative" variants={fadeUp}>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-center">THIS MONTH'S HIGHLIGHTS</h2>
            <motion.svg width="350" height="30" viewBox="0 0 350 30" fill="none" className="absolute -bottom-10 text-[#ff5c5c]">
              <motion.path d="M 20 15 Q 80 -5, 140 15 T 240 15 T 320 15" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" variants={drawPath}/>
            </motion.svg>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mt-12">
            {[
              { img: 'bitcoin_pile.png', title: '1 Billion Tokens Analyzed', desc: 'Our LLM is now powered by over 1 billion high-quality educational tokens. This scale enables deep statistical learning and precise factual reasoning, moving far beyond standard, noisy web data.' },
              { img: 'curated_documents.png', title: '968k+ Curated Documents', desc: 'We\'ve indexed a massive library of 968,670 discrete documents filtered for dense educational value. By using curated content, we\'ve drastically reduced misinformation and "AI noise" in student responses.' },
              { img: 'hdfs_code.png', title: 'Zero-Latency HDFS Integration', desc: 'Our new Hadoop Distributed File System (HDFS) architecture ensures high-throughput data streaming. Even with a 2.90GB dataset, students experience instant response times during peak study sessions.' }
            ].map((item, i) => (
              <motion.div key={i} className="flex flex-col" variants={fadeUp}>
                <div className="w-full aspect-[4/3] rounded-[2rem] overflow-hidden mb-8 bg-gray-100 shadow-xl">
                  <img src={`/assets/images/${item.img}`} alt={item.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
                </div>
                <h3 className="text-3xl font-semibold mb-4 leading-tight">{item.title}</h3>
                <p className="text-base font-mono text-black/70 leading-relaxed">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* PLATFORM UPDATES */}
      <section className="min-h-screen flex flex-col justify-center py-24 px-6 max-w-7xl mx-auto w-full">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerContainer}>
          <motion.h2 className="text-4xl md:text-6xl font-bold tracking-tight text-center mb-20" variants={fadeUp}>
            PLATFORM UPDATES
          </motion.h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { icon: GraduationCap, title: 'Profile Style Extraction', desc: 'Professors can now upload course notes (PDF, DOCX, TXT) and let Cobble AI extract their unique teaching tone and structure in seconds.' },
              { icon: Cloud, title: 'Large-Scale Knowledge Base', desc: 'We\'ve successfully indexed over 1,000,180,358 high-quality educational tokens, providing deep factual reasoning for every student doubt.' },
              { icon: Bell, title: 'Actionable Student Data', desc: 'Our new heatmap feature identifies topics needing review, allowing professors to send nudges or export detailed PDF progress reports.', hasArrow: true }
            ].map((item, i) => (
              <motion.div key={i} variants={fadeUp} className="border-[5px] border-black p-10 text-center flex flex-col items-center group hover:-translate-y-2 transition-transform duration-300 shadow-[12px_12px_0_0_rgba(0,0,0,1)] hover:shadow-[16px_16px_0_0_rgba(0,0,0,1)] bg-white">
                <div className="w-24 h-24 mb-8 text-[#ff5c5c] relative flex justify-center items-center">
                  <item.icon className="w-full h-full" strokeWidth={1.5} />
                  {item.hasArrow && (
                    <motion.svg width="60" height="30" viewBox="0 0 60 30" className="absolute -top-4 -right-10 hidden lg:block" initial="hidden" whileInView="visible" viewport={{ once: true }}>
                      <motion.path d="M 10 20 Q 30 0, 50 20" stroke="#ff5c5c" strokeWidth="4" strokeLinecap="round" fill="none" variants={drawPath}/>
                      <motion.path d="M 40 25 L 50 20 L 55 10" stroke="#ff5c5c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" variants={drawPath}/>
                    </motion.svg>
                  )}
                  {i === 0 && (
                    <div className="absolute -bottom-4 left-0 right-0 h-1 bg-[#ff5c5c]"></div>
                  )}
                </div>
                <h3 className="text-2xl font-bold mb-6 uppercase">{item.title}</h3>
                <p className="text-base font-mono text-black/70 leading-relaxed">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* PROFESSOR SPOTLIGHT */}
      <section className="min-h-screen flex flex-col justify-center py-24 px-6 max-w-7xl mx-auto w-full">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={staggerContainer}>
          <motion.div className="flex justify-center items-center gap-6 mb-20" variants={fadeUp}>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-center uppercase">Professor Spotlight</h2>
            <Sparkles className="text-[#ff5c5c] w-10 h-10" strokeWidth={2} />
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { img: 'prof_1.png', name: 'DR. SANJAY KUMAR', desc: 'Leading project evaluation and core problem definition.' },
              { img: 'prof_2.png', name: 'YOGESH CHAUDHARI', desc: 'Managing HDFS infrastructure for fast, scalable AI streaming.' },
              { img: 'prof_3.png', name: 'DR JAIDEEPSINH RAULJI', desc: 'Guiding our 1-billion-token knowledge base for educational accuracy.' }
            ].map((prof, i) => (
              <motion.div key={i} variants={fadeUp} className="border-[5px] border-[#ff5c5c] rounded-xl bg-white overflow-hidden shadow-sm flex flex-col">
                <div className="border-b-[5px] border-[#ff5c5c] px-4 py-3 flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border-[3px] border-[#ff5c5c] bg-white"></div>
                  <div className="w-4 h-4 rounded-full border-[3px] border-[#ff5c5c] bg-white"></div>
                  <div className="w-4 h-4 rounded-full border-[3px] border-[#ff5c5c] bg-[#ff5c5c]"></div>
                </div>
                <div className="p-8 flex-1 flex flex-col">
                  <div className="w-full aspect-square rounded-2xl overflow-hidden mb-8 bg-gray-100">
                    <img src={`/assets/images/${prof.img}`} alt={prof.name} className="w-full h-full object-cover" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-center uppercase">{prof.name}</h3>
                  <p className="text-base font-mono text-black/80 text-center leading-relaxed flex-1">
                    {prof.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA SECTION */}
      <section className="min-h-screen flex flex-col justify-center py-24 px-6 max-w-3xl mx-auto text-center">
        <motion.div className="flex flex-col items-center" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.5 }} variants={staggerContainer}>
          <motion.svg style={{ overflow: 'visible' }} width="100" height="200" viewBox="0 0 100 200" className="text-[#ff5c5c] mb-10" variants={fadeUp}>
             {/* Smooth C1 continuous double-loop spring with wide visible loops and a downward tail */}
             <motion.path d="M 50.0,55.0 L 54.4,55.8 L 58.7,56.2 L 62.9,56.3 L 66.9,55.9 L 70.6,55.3 L 74.0,54.3 L 77.0,53.0 L 79.6,51.4 L 81.7,49.7 L 83.3,47.8 L 84.4,45.7 L 84.9,43.6 L 84.9,41.5 L 84.4,39.4 L 83.3,37.4 L 81.7,35.4 L 79.6,33.7 L 77.0,32.2 L 74.0,30.9 L 70.6,29.9 L 66.9,29.2 L 62.9,28.9 L 58.7,28.9 L 54.4,29.3 L 50.0,30.1 L 45.6,31.3 L 41.3,32.9 L 37.1,34.9 L 33.1,37.2 L 29.4,39.9 L 26.0,42.9 L 23.0,46.2 L 20.4,49.8 L 18.3,53.5 L 16.7,57.5 L 15.6,61.5 L 15.1,65.6 L 15.1,69.8 L 15.6,73.9 L 16.7,77.9 L 18.3,81.9 L 20.4,85.6 L 23.0,89.2 L 26.0,92.5 L 29.4,95.5 L 33.1,98.2 L 37.1,100.5 L 41.3,102.5 L 45.6,104.1 L 50.0,105.3 L 54.4,106.1 L 58.7,106.5 L 62.9,106.5 L 66.9,106.2 L 70.6,105.5 L 74.0,104.5 L 77.0,103.2 L 79.6,101.7 L 81.7,100.0 L 83.3,98.0 L 84.4,96.0 L 84.9,93.9 L 84.9,91.8 L 84.4,89.7 L 83.3,87.6 L 81.7,85.7 L 79.6,84.0 L 77.0,82.4 L 74.0,81.1 L 70.6,80.1 L 66.9,79.5 L 62.9,79.1 L 58.7,79.2 L 54.4,79.6 L 50.0,80.4 L 45.6,81.6 L 41.3,83.2 L 37.1,85.2 L 33.1,87.5 L 29.4,90.2 L 26.0,93.2 L 23.0,96.5 L 20.4,100.0 L 18.3,103.8 L 16.7,107.7 L 15.6,111.8 L 15.1,115.9 L 15.1,120.0 L 15.6,124.2 L 16.7,128.2 L 18.3,132.1 L 20.4,135.9 L 23.0,139.4 L 26.0,142.7 L 29.4,145.7 L 33.1,148.4 L 37.1,150.8 L 41.3,152.7 L 45.6,154.3 L 50.0,155.5 C 70.0,160.0 60.0,165.0 60.0,180.0" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" variants={drawPath}/>
             {/* Arrow head pointing straight down */}
             <motion.path d="M 45,165 L 60,180 L 75,165" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" variants={drawPath}/>
          </motion.svg>
          
          <motion.h2 className="text-5xl md:text-7xl font-black tracking-tight mb-8" variants={fadeUp}>
            READY TO UPGRADE<br/>YOUR LEARNING?
          </motion.h2>
          
          <motion.p className="text-xl font-mono text-black/80 mb-12" variants={fadeUp}>
            Join your class today and start chatting with an<br/>AI that finally speaks your language.
          </motion.p>

          <motion.button onClick={handleStart} variants={fadeUp} className="bg-[#ff5c5c] text-white px-12 py-5 rounded-full text-2xl font-bold hover:bg-[#ff4444] transition-all hover:scale-105 shadow-2xl shadow-[#ff5c5c]/30">
            Start a Class
          </motion.button>
        </motion.div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#ff5c5c] text-white py-16 px-8">
        <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex gap-6 font-medium text-lg">
            <a href="#about" className="hover:text-white/80 transition-colors">About us</a>
            <a href="#how" className="hover:text-white/80 transition-colors">How it Works</a>
            <button onClick={handleStart} className="hover:text-white/80 transition-colors">Start Now</button>
          </div>
          
          <div className="text-center">
            <a href="mailto:support@cobbleai.com" className="font-mono text-base hover:text-white/80 transition-colors">
              support@cobbleai.com
            </a>
          </div>

          <div className="flex flex-col items-end gap-6">
            <div className="flex gap-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hover:text-white/80 cursor-pointer transition-colors"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hover:text-white/80 cursor-pointer transition-colors"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hover:text-white/80 cursor-pointer transition-colors"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
            </div>
            <p className="font-mono text-sm opacity-90">Cobble Ai Limited 2026</p>
          </div>
        </div>
      </footer>
      
    </div>
  );
}
