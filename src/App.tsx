/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Smartphone, 
  MessageSquare, 
  Settings, 
  Wifi, 
  Usb, 
  RefreshCw, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Trash2,
  Copy,
  Search,
  Zap,
  Shield,
  Clock,
  ExternalLink,
  ChevronRight,
  Info as InfoIcon,
  Archive,
  Send,
  MoreHorizontal,
  Activity,
  Globe,
  Star,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import * as d3 from 'd3';
import { GoogleGenAI } from "@google/genai";
import { format } from 'date-fns';
import { cn } from './lib/utils';
import type { SMSMessage, DeviceStatus, SMART_INFO, DeviceType } from './types';

// Icons for different types of senders
const SENDER_ICONS: Record<string, React.ReactNode> = {
  bank: <Shield className="w-4 h-4 text-blue-500" />,
  personal: <Smartphone className="w-4 h-4 text-emerald-500" />,
  service: <Zap className="w-4 h-4 text-indigo-500" />,
  spam: <AlertCircle className="w-4 h-4 text-rose-500" />,
  unknown: <MessageSquare className="w-4 h-4 text-slate-400" />,
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>({ connected: false, type: 'serial' });
  const [isLoading, setIsLoading] = useState(false);
  const [smartInfo, setSmartInfo] = useState<Record<string, SMART_INFO>>({});
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [signalHistory, setSignalHistory] = useState<number[]>(Array(50).fill(60));
  
  const serialPort = useRef<any>(null);
  const reader = useRef<any>(null);
  const sparklineRef = useRef<SVGSVGElement>(null);

  // Update signal history over time for visualization
  useEffect(() => {
    const interval = setInterval(() => {
      setSignalHistory(prev => {
        const last = prev[prev.length - 1];
        const next = Math.max(20, Math.min(100, last + (Math.random() * 10 - 5)));
        return [...prev.slice(1), next];
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Draw D3 Sparkline
  useEffect(() => {
    if (!sparklineRef.current) return;
    const svg = d3.select(sparklineRef.current);
    svg.selectAll("*").remove();

    const width = 200;
    const height = 40;
    const x = d3.scaleLinear().domain([0, signalHistory.length - 1]).range([0, width]);
    const y = d3.scaleLinear().domain([0, 100]).range([height, 0]);

    const line = d3.line<number>()
      .x((_, i) => x(i))
      .y(d => y(d))
      .curve(d3.curveBasis);

    svg.append("path")
      .datum(signalHistory)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.6)
      .attr("d", line);
      
    // Add a pulsing head dot
    svg.append("circle")
      .attr("cx", x(signalHistory.length - 1))
      .attr("cy", y(signalHistory[signalHistory.length - 1]))
      .attr("r", 3)
      .attr("fill", "#3b82f6")
      .attr("class", "animate-pulse");
      
  }, [signalHistory]);

  // Simulated data for demo
  useEffect(() => {
    const demoMessages: SMSMessage[] = [
      {
        id: '1',
        sender: 'Google',
        content: 'G-123456 is your Google verification code.',
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
        isRead: false,
        type: 'incoming',
      },
      {
        id: '2',
        sender: '+1234567890',
        content: 'Hey, are you coming to the party tonight? Bring some snacks!',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
        isRead: true,
        type: 'incoming',
      },
      {
        id: '3',
        sender: 'NetherlandBank',
        content: 'Alert: Unusual login attempt from IP 192.168.1.5. If this was not you, please secure your account.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
        isRead: true,
        type: 'incoming',
      }
    ];
    setMessages(demoMessages);
  }, []);

  const connectDevice = async (type: DeviceType) => {
    setIsLoading(true);
    try {
      if (type === 'serial') {
        if (!('serial' in navigator)) {
          alert('Web Serial is not supported in this browser. Please use Chrome or Edge.');
          return;
        }
        // @ts-ignore
        serialPort.current = await navigator.serial.requestPort();
        await serialPort.current.open({ baudRate: 9600 });
        setDeviceStatus({ 
          connected: true, 
          type: 'serial', 
          portName: 'USB Modem',
          operator: 'Carrier Detected'
        });
      } else {
        setDeviceStatus({ 
          connected: true, 
          type: 'router', 
          gatewayIp: '192.168.1.1',
          operator: 'Pocket Hub @ 4G'
        });
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to device.');
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectDevice = async () => {
    if (serialPort.current) {
      if (reader.current) {
        await reader.current.cancel();
      }
      await serialPort.current.close();
      serialPort.current = null;
    }
    setDeviceStatus({ connected: false, type: 'serial' });
  };

  const analyzeMessage = async (msg: SMSMessage) => {
    if (smartInfo[msg.id]) return;
    
    setIsAnalyzing(msg.id);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        config: {
          responseMimeType: "application/json",
        },
        contents: `Analyze this SMS message and provide a sophisticated JSON summary.
        Message: "${msg.content}"
        
        Desired JSON structure:
        {
          "isOTP": boolean,
          "otpCode": string (if isOTP is true),
          "senderType": "bank" | "personal" | "service" | "spam" | "unknown",
          "summary": string (very concise one-sentence description),
          "confidence": number (0-1),
          "suggestedActions": string[] (e.g., ["Verify Account", "Report Spam", "Save Event", "View Location", "Copy Code"])
        }`
      });
      
      const result = JSON.parse(response.text);
      setSmartInfo(prev => ({ ...prev, [msg.id]: result }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(null);
    }
  };

  const selectedMessage = messages.find(m => m.id === selectedMessageId);

  useEffect(() => {
    if (selectedMessageId && !smartInfo[selectedMessageId]) {
      const msg = messages.find(m => m.id === selectedMessageId);
      if (msg) analyzeMessage(msg);
    }
  }, [selectedMessageId]);

  return (
    <div className="flex h-screen bg-[#f1f5f9] text-slate-900 font-sans overflow-hidden">
      {/* Sidebar Nav */}
      <aside className="w-72 bg-[#1e293b] text-slate-50 flex flex-col z-20 shadow-xl">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight block">SIM Link Pro</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Enterprise Hub</span>
            </div>
          </div>
          
          <nav className="space-y-1.5">
            <button className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600/10 text-blue-400 rounded-xl font-medium transition-all group">
              <MessageSquare className="w-5 h-5" />
              <span>Inbox</span>
              <span className="ml-auto text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full ring-4 ring-blue-600/10">3</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
              <Send className="w-5 h-5" />
              <span>Sent Outbox</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
              <Archive className="w-5 h-5" />
              <span>Message Archive</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
              <Settings className="w-5 h-5" />
              <span>System Settings</span>
            </button>
          </nav>
        </div>

        <div className="mt-auto p-6 space-y-4">
          {/* Signal Integrity Overlay */}
          <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
             <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Signal Integrity</span>
                <span className="text-[9px] font-mono text-blue-400">{Math.round(signalHistory[signalHistory.length-1])}%</span>
             </div>
             <svg ref={sparklineRef} className="w-full h-10 overflow-visible" />
          </div>

          <div className="bg-slate-800/40 rounded-2xl p-5 border border-slate-700/50 backdrop-blur-sm">
            <div className="text-[10px] uppercase text-slate-500 font-bold mb-4 tracking-widest">Hardware Status</div>
            <div className="space-y-3.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Modem Link</span>
                <span className="flex items-center gap-2 font-medium">
                  {deviceStatus.connected ? 'Online' : 'Searching'} 
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    deviceStatus.connected ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-slate-600"
                  )} />
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Source</span>
                <span className="text-slate-200 font-medium text-xs">
                  {deviceStatus.connected ? (deviceStatus.type === 'serial' ? 'USB' : 'WIFI') : 'None'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Signal</span>
                <span className="text-slate-200 font-medium">
                  {deviceStatus.connected ? 'Strong - 4G' : 'Disconnected'}
                </span>
              </div>
            </div>
            
            <div className="mt-5 space-y-2">
              {!deviceStatus.connected ? (
                <>
                  <button 
                    onClick={() => connectDevice('serial')}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Usb className="w-3.5 h-3.5" /> Link USB Modem
                  </button>
                  <button 
                    onClick={() => connectDevice('router')}
                    className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Wifi className="w-3.5 h-3.5" /> Connect Router
                  </button>
                </>
              ) : (
                <button 
                  onClick={disconnectDevice}
                  className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg text-xs font-bold transition-all border border-rose-500/20"
                >
                  Terminate Link
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-700/50 text-[10px] text-slate-500 font-medium flex justify-between items-center">
          <span>v2.1.0-PRO</span>
          <span className="flex items-center gap-1"><Shield className="w-3 h-3"/> SECURE</span>
        </div>
      </aside>

      {/* Message List Column */}
      <main className="flex-1 flex flex-col bg-slate-50">
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Inbox</h2>
            <p className="text-xs text-slate-500 font-medium">Monitoring all SIM traffic</p>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Find messages..."
                className="pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm w-64 focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all outline-none"
              />
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <button className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95">
              Compose
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Message List */}
          <LayoutGroup>
            <div className="w-96 bg-white border-r border-slate-200 overflow-y-auto overflow-x-hidden">
              {messages.length === 0 ? (
                // ... same
                 <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-30 gap-4">
                    <MessageSquare className="w-10 h-10" />
                    <p className="text-sm font-semibold">Gateway is idle</p>
                 </div>
              ) : (
                <div className="flex flex-col">
                  {messages.map((msg) => (
                    <motion.button 
                      layout
                      key={msg.id}
                      onClick={() => setSelectedMessageId(msg.id)}
                      className={cn(
                        "group p-5 text-left transition-all border-b border-slate-50 relative",
                        selectedMessageId === msg.id 
                          ? "bg-blue-50/50" 
                          : "bg-white hover:bg-slate-50",
                      )}
                    >
                      {selectedMessageId === msg.id && (
                        <motion.div layoutId="activeMsgLine" className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />
                      )}
                      
                      <div className="flex justify-between items-start mb-1.5">
                        <span className={cn(
                          "font-bold text-sm tracking-tight",
                          !msg.isRead ? "text-slate-900" : "text-slate-600"
                        )}>{msg.sender}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                          {format(msg.timestamp, 'HH:mm')}
                        </span>
                      </div>
                      
                      <p className={cn(
                        "text-sm line-clamp-1",
                        !msg.isRead ? "text-slate-800 font-semibold" : "text-slate-500"
                      )}>
                        {msg.content}
                      </p>

                      <div className="mt-3 flex gap-2">
                         {smartInfo[msg.id]?.isOTP && (
                           <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded uppercase tracking-wider border border-amber-200">
                             OTP Detected
                           </span>
                         )}
                         {smartInfo[msg.id]?.senderType && smartInfo[msg.id]?.senderType !== 'unknown' && (
                           <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded uppercase tracking-wider border border-slate-200">
                             {smartInfo[msg.id].senderType}
                           </span>
                         )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </LayoutGroup>

          {/* Detail View */}
          <div className="flex-1 bg-white relative overflow-y-auto">
            <AnimatePresence mode="wait">
              {selectedMessage ? (
                <motion.div 
                  key={selectedMessage.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="p-16 max-w-4xl mx-auto w-full"
                >
                  <div className="flex items-center gap-5 mb-12">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500 font-bold text-2xl shadow-inner uppercase">
                      {selectedMessage.sender.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{selectedMessage.sender}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 font-medium">
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {format(selectedMessage.timestamp, 'MMM dd, yyyy • HH:mm')}</span>
                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                        <span>Sender ID: {selectedMessage.sender}</span>
                      </div>
                    </div>
                    <div className="ml-auto flex gap-3">
                      <button className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all shadow-sm">
                        <Archive className="w-5 h-5" />
                      </button>
                      <button className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition-all shadow-sm">
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all shadow-sm">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-[32px] p-10 border border-slate-200 mb-10 shadow-sm group relative">
                    <p className="text-xl leading-relaxed text-slate-700 font-medium">
                      {selectedMessage.content}
                    </p>
                    <button 
                      onClick={() => navigator.clipboard.writeText(selectedMessage.content)}
                      className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-all p-2.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-blue-500 shadow-sm"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Smart Analysis Block */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <Zap className="w-5 h-5 text-blue-600" />
                      <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Neural Intelligence Layer</h4>
                    </div>

                    <div className="grid grid-cols-12 gap-6">
                       <div className="col-span-8 space-y-6">
                         <div className="bg-white rounded-[32px] p-8 border border-slate-200 shadow-sm min-h-[160px] flex flex-col">
                            {isAnalyzing === selectedMessage.id ? (
                               <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
                                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 animate-pulse">Analyzing Payload Data...</p>
                               </div>
                            ) : smartInfo[selectedMessage.id] ? (
                               <div className="space-y-6">
                                  <div className="flex items-center gap-4">
                                     <div className={cn(
                                       "w-12 h-12 rounded-xl flex items-center justify-center border",
                                       smartInfo[selectedMessage.id].senderType === 'bank' ? "bg-blue-50 border-blue-100" :
                                       smartInfo[selectedMessage.id].senderType === 'personal' ? "bg-emerald-50 border-emerald-100" : "bg-slate-100 border-slate-200"
                                     )}>
                                        {SENDER_ICONS[smartInfo[selectedMessage.id].senderType]}
                                     </div>
                                     <div>
                                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Classification</p>
                                        <p className="text-lg font-bold text-slate-800 uppercase">{smartInfo[selectedMessage.id].senderType} SENDER</p>
                                     </div>
                                  </div>
                                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex-1">
                                     <p className="text-sm italic text-slate-600 line-clamp-3 leading-relaxed">"{smartInfo[selectedMessage.id].summary}"</p>
                                  </div>
                                  
                                  {/* Suggested Actions Row */}
                                  {smartInfo[selectedMessage.id].suggestedActions?.length > 0 && (
                                     <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 mt-auto">
                                        <h5 className="w-full text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-1">Recommended Response Channel</h5>
                                        {smartInfo[selectedMessage.id].suggestedActions.map((action, i) => (
                                          <button 
                                            key={i}
                                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-tight hover:bg-slate-50 hover:border-slate-400 transition-all flex items-center gap-1.5"
                                          >
                                            {action}
                                            <ArrowRight className="w-3 h-3 text-blue-500" />
                                          </button>
                                        ))}
                                     </div>
                                  )}
                               </div>
                            ) : (
                               <button 
                                 onClick={() => analyzeMessage(selectedMessage)}
                                 className="flex-1 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 rounded-2xl hover:bg-slate-50 hover:border-blue-400 transition-all group"
                               >
                                  <Search className="w-6 h-6 text-slate-300 group-hover:text-blue-500" />
                                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400 group-hover:text-blue-600">Request Neural Run</span>
                               </button>
                            )}
                         </div>
                       </div>
                       
                       <div className="col-span-4 h-full">
                          <div className={cn(
                            "h-full rounded-[32px] p-8 border shadow-sm flex flex-col items-center justify-center text-center transition-all",
                            smartInfo[selectedMessage.id]?.isOTP ? "bg-blue-600 border-blue-500 text-white" : "bg-white border-slate-200 text-slate-400"
                          )}>
                             {smartInfo[selectedMessage.id]?.isOTP ? (
                               <>
                                 <Zap className="w-8 h-8 mb-4 text-blue-200" />
                                 <span className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-2">Code Extraction</span>
                                 <span className="text-4xl font-black tracking-[0.2em] mb-6">{smartInfo[selectedMessage.id]?.otpCode}</span>
                                 <button 
                                   onClick={() => navigator.clipboard.writeText(smartInfo[selectedMessage.id]?.otpCode || '')}
                                   className="w-full py-2.5 bg-white text-blue-600 rounded-xl text-xs font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all"
                                 >
                                   Copy Code
                                 </button>
                               </>
                             ) : (
                               <>
                                 <Smartphone className="w-8 h-8 mb-3 opacity-20" />
                                 <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">No static code detected in payload</p>
                               </>
                             )}
                          </div>
                       </div>
                    </div>
                  </div>

                  <div className="mt-16 flex gap-4">
                    <div className="flex-1 relative">
                       <input 
                        type="text" 
                        placeholder="Type reply..." 
                        className="w-full bg-slate-100 border-2 border-transparent focus:border-blue-500/10 focus:bg-white rounded-2xl py-4 px-6 text-sm outline-none transition-all shadow-inner"
                       />
                    </div>
                    <button className="bg-slate-900 hover:bg-black text-white px-10 rounded-2xl font-bold flex items-center justify-center gap-2 group transition-all">
                       Send <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
                   <div className="w-24 h-24 bg-slate-50 rounded-[40px] flex items-center justify-center text-slate-200">
                      <div className="w-20 h-20 bg-white rounded-[32px] shadow-xl flex items-center justify-center text-slate-300 ring-1 ring-slate-100">
                         <MessageSquare className="w-10 h-10" />
                      </div>
                   </div>
                   <div className="max-w-xs space-y-2">
                     <p className="text-xl font-bold text-slate-800">Message Inspector</p>
                     <p className="text-sm text-slate-400 leading-relaxed font-medium">Select a communication record from the left column to begin neural analysis and extraction.</p>
                   </div>
                   <div className="h-px w-20 bg-slate-100" />
                   <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300 mb-1">Status</span>
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full border border-emerald-100">SYSTEM_READY</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300 mb-1">Encryption</span>
                        <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full border border-blue-100">AES_256_ACTIVE</span>
                      </div>
                   </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
