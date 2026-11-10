"use client";

import React, { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

interface TrainingState {
  running: boolean;
  current_epoch: number;
  total_epochs: number;
  loss: number;
  recon: number;
  kl: number;
  error: string | null;
}

interface TrainingProgressProps {
  visible: boolean;
  onComplete?: () => void;
}

export default function TrainingProgress({ visible, onComplete }: TrainingProgressProps) {
  const [state, setstate] = useState<TrainingState>({
    running: false,
    current_epoch: 0,
    total_epochs: 0,
    loss: 0,
    recon: 0,
    kl: 0,
    error: null,
  });

  const [history, setHistory] = useState<Array<{
    epoch: number;
    loss: number;
    recon: number;
    kl: number;
  }>>([]);

  useEffect(() => {
    if (!visible) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API}/model/progress`);
        if (response.ok) {
          const data: TrainingState = await response.json();
          setstate(data);

          // Only trigger complete once when training finishes
          if (!data.running && state.running && onComplete) {
            onComplete();
          }
        } else {
          console.warn("Progress endpoint returned:", response.status, response.statusText);
          // Set error if AI service is unreachable
          if (!state.error) {
            setstate((prev) => ({
              ...prev,
              error: `Progress service unavailable (${response.status})`,
              running: false,
            }));
          }
        }
      } catch (err) {
        console.error("Failed to fetch training progress:", err);
        // Set connection error state
        if (!state.error) {
          setstate((prev) => ({
            ...prev,
            error: `Cannot fetch training progress from ${API}/model/progress - ${err instanceof Error ? err.message : String(err)}`,
            running: false,
          }));
        }
      }
    }, 1000); // Poll every second

    return () => clearInterval(pollInterval);
  }, [visible, state.running]);

  if (!visible) return null;

  const progress = state.total_epochs > 0 ? (state.current_epoch / state.total_epochs) * 100 : 0;
  const hasError = !!state.error;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Training LSTM-VAE</h2>
          <span className="text-2xl">
            {hasError ? "❌" : state.running ? "⏳" : "✅"}
          </span>
        </div>

        {/* Error Message */}
        {hasError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-semibold">Training Error</p>
            <p className="text-red-700 text-sm mt-1">{state.error}</p>
          </div>
        )}

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              Epoch {state.current_epoch} / {state.total_epochs}
            </span>
            <span className="text-sm font-medium text-gray-700">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Loss</p>
            <p className="text-2xl font-bold text-blue-900">{state.loss.toFixed(4)}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
            <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Recon Loss</p>
            <p className="text-2xl font-bold text-purple-900">{state.recon.toFixed(4)}</p>
          </div>
          <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-4">
            <p className="text-xs font-semibold text-pink-600 uppercase tracking-wide mb-1">KL Divergence</p>
            <p className="text-2xl font-bold text-pink-900">{state.kl.toFixed(4)}</p>
          </div>
        </div>

        {/* Status Message */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium text-gray-700">
            {hasError
              ? "❌ Training failed - see error above"
              : state.running
              ? `▶️ Training in progress... (Epoch ${state.current_epoch}/${state.total_epochs})`
              : "✅ Training completed successfully!"}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onComplete}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-lg transition-colors"
          >
            Close
          </button>
          {state.running && (
            <button
              disabled
              className="px-6 py-2 bg-blue-500 text-white font-medium rounded-lg opacity-50 cursor-not-allowed"
            >
              Training...
            </button>
          )}
        </div>

        {/* Training History Chart (minimal) */}
        {history.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm font-semibold text-gray-700 mb-3">Loss Trend</p>
            <div className="h-24 bg-gray-50 rounded-lg p-2 flex items-end gap-1 overflow-x-auto">
              {history.slice(-20).map((item, idx) => {
                const maxLoss = Math.max(...history.map((h) => h.loss), 1);
                const height = (item.loss / maxLoss) * 100;
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-blue-500 rounded-t opacity-70 hover:opacity-100 transition-opacity"
                    style={{ height: `${height}%`, minHeight: "2px" }}
                    title={`E${item.epoch}: ${item.loss.toFixed(4)}`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
