import { useState } from "react";
import { ProviderPicker } from "./ProviderPicker";
import { ApiKeyInput } from "./ApiKeyInput";
import { ModelSelector } from "./ModelSelector";
import { AgentSetup } from "./AgentSetup";
import { invoke } from "@tauri-apps/api/core";
import type { ProviderInfo } from "../../lib/providers";

interface Props {
  onComplete: () => void;
}

type Step = "welcome" | "provider" | "apikey" | "model" | "personality";

export function WelcomeScreen({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | undefined | undefined>(undefined);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [completed, setCompleted] = useState(false);

  function handleProviderSelect(provider: ProviderInfo) {
    setSelectedProvider(provider);
    setBaseUrl(provider.baseUrl);
    setStep("apikey");
  }

  function handleApiKeyComplete(data: { apiKey: string; baseUrl?: string }) {
    if (data.baseUrl) setBaseUrl(data.baseUrl);
    setStep("model");
  }

  function handleModelSelect(model: string) {
    setSelectedModel(model);
    setStep("personality");
  }

  async function handleAgentComplete() {
    if (!selectedProvider) return;

    try {
      const result = await invoke("provider_set", {
        provider: selectedProvider.id,
        model: selectedModel,
        baseUrl: baseUrl || selectedProvider.baseUrl,
      });
      // Mark onboarded (decoupled from provider config so reset can re-trigger this).
      await invoke("engine_rpc", { method: "settings.set", params: { key: "onboarded", value: "true" } }).catch(() => {});
      console.log("[WelcomeScreen] provider_set result:", result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[WelcomeScreen] provider_set failed:", msg);
      alert("Provider save failed: " + msg);
      return;
    }

    setCompleted(true);
    setTimeout(() => onComplete(), 300);
  }

  if (step === "welcome") {
    return (
      <main className="flex h-screen flex-col items-center justify-center bg-nexus-bg">
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="font-display text-7xl font-semibold tracking-tight text-gold-foil">Nexus</h1>
          <p className="max-w-md text-sm text-neutral-400">
            Open-source AI agent desktop platform.
            <br />
            Pick a provider, enter your API key, and start chatting.
          </p>
          <button
            onClick={() => setStep("provider")}
            className="mt-4 rounded-full bg-gold-sheen px-10 py-3 text-sm font-semibold tracking-wide text-black shadow-lg shadow-nexus-gold/10 transition hover:brightness-110"
          >
            Get Started
          </button>
        </div>
      </main>
    );
  }

  const steps = ["provider", "apikey", "model", "personality"];
  const currentIdx = steps.indexOf(step);

  return (
    <main className="flex h-screen flex-col items-center justify-start overflow-y-auto bg-nexus-bg py-8">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  i <= currentIdx ? "bg-nexus-accent" : "bg-nexus-border"
                }`}
              />
              {i < steps.length - 1 && (
                <div className={`h-px w-8 ${i < currentIdx ? "bg-nexus-accent" : "bg-nexus-border"}`} />
              )}
            </div>
          ))}
        </div>

        <h2 className="mb-6 text-center font-display text-2xl font-medium text-nexus-fg">
          {step === "provider" && "Choose Your AI Provider"}
          {step === "apikey" && (selectedProvider?.authType === "local" ? "Configure Base URL" : "Enter API Key")}
          {step === "model" && "Select a Model"}
          {step === "personality" && "Set Up Your Agent"}
        </h2>

        <div className={`transition-all duration-300 ${completed ? "opacity-0 -translate-y-2" : "opacity-100"}`}>
          {step === "provider" && (
            <ProviderPicker onSelect={handleProviderSelect} selected={selectedProvider?.id} />
          )}

          {step === "apikey" && selectedProvider && (
            <ApiKeyInput
              provider={selectedProvider}
              onComplete={handleApiKeyComplete}
              onBack={() => setStep("provider")}
            />
          )}

          {step === "model" && selectedProvider && (
            <ModelSelector
              provider={selectedProvider}
              onComplete={handleModelSelect}
              onBack={() => setStep("apikey")}
            />
          )}

          {step === "personality" && (
            <AgentSetup
              onComplete={handleAgentComplete}
              onBack={() => setStep("model")}
            />
          )}
        </div>
      </div>
    </main>
  );
}
