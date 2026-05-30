import React, { useState, useEffect, useRef } from "react";
import { X, Trash2, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

export function DebugLogger() {
  const [logs, setLogs] = useState<
    { id: number; type: string; args: string[]; timestamp: string }[]
  >([]);
  const [isOpen, setIsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Intercept console
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    let logId = 0;

    const processArgs = (args: any[]) => {
      return args.map((arg) => {
        if (arg instanceof Error) {
          return arg.message + "\n" + arg.stack;
        } else if (typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      });
    };

    const addLog = (type: string, args: any[]) => {
      const timestamp = new Date().toISOString().substring(11, 23);
      const processedArgs = processArgs(args);
      setLogs((prev) => [
        ...prev.slice(-99),
        { id: ++logId, type, args: processedArgs, timestamp },
      ]);
    };

    console.log = function (...args) {
      addLog("log", args);
      originalLog.apply(console, args);
    };

    console.warn = function (...args) {
      addLog("warn", args);
      originalWarn.apply(console, args);
    };

    console.error = function (...args) {
      addLog("error", args);
      originalError.apply(console, args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-50 bg-gray-800 text-white p-2 rounded-md shadow-lg text-xs opacity-50 hover:opacity-100"
      >
        Debug Log ({logs.length})
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-64 bg-gray-900 border-t border-gray-700 z-50 flex flex-col font-mono text-xs">
      <div className="flex justify-between items-center p-2 bg-gray-800 border-b border-gray-700 text-white">
        <span className="font-bold">Console Debugger</span>
        <div className="flex space-x-2">
          <button
            onClick={() => setLogs([])}
            className="p-1 hover:bg-gray-700 rounded"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-gray-700 rounded"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1" ref={scrollRef}>
        {logs.map((log) => (
          <div
            key={log.id}
            className={`p-1 border-b border-gray-800 break-words flex justify-between items-start group ${
              log.type === "error"
                ? "text-red-400 bg-red-900/20"
                : log.type === "warn"
                  ? "text-yellow-400 bg-yellow-900/20"
                  : "text-gray-300"
            }`}
          >
            <div className="flex-1 pr-2">
              <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
              {log.args.join(" ")}
            </div>
            {log.type === "error" && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(log.args.join(" "));
                  setCopiedId(log.id);
                  setTimeout(() => setCopiedId(null), 2000);
                }}
                className="p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors flex-shrink-0"
                title="Copy error"
              >
                {copiedId === log.id ? (
                  <Check size={14} className="text-green-400" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            )}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-gray-500">No logs yet...</div>
        )}
      </div>
    </div>
  );
}
