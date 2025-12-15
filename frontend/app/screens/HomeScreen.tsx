// Client-side RAG playground
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  StyleSheet,
} from "react-native";
import * as webllm from "@mlc-ai/web-llm";

type EngineMode = "init" | "webllm" | "fallback";

type RagChunk = {
  id: string;
  text: string;
  source?: string;
};

export default function HomeScreen() {
  const [engineMode, setEngineMode] = useState<EngineMode>("init");
  const [engine, setEngine] = useState<any>(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loadingAnswer, setLoadingAnswer] = useState(false);

  const [initError, setInitError] = useState<string | null>(null);

  const [chunks, setChunks] = useState<RagChunk[] | null>(null);
  const [embeddings, setEmbeddings] = useState<number[][] | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);

  const [lastContext, setLastContext] = useState<RagChunk[]>([]);

  // ========== Load RAG index ==========
  useEffect(() => {
    (async () => {
      try {
        // chunks
        const chunksRes = await fetch("rag/corpus_chunks.json");
        if (!chunksRes.ok) {
          throw new Error(
            `Failed to load corpus_chunks.json: ${chunksRes.status}`
          );
        }
        const chunksJson = (await chunksRes.json()) as RagChunk[];
        setChunks(chunksJson);

        // embeddings
        try {
          const embedsRes = await fetch("rag/corpus_embeddings.json");
          if (embedsRes.ok) {
            const embedsJson = (await embedsRes.json()) as number[][];
            if (embedsJson.length === chunksJson.length) {
              setEmbeddings(embedsJson);
            } else {
              console.warn(
                "Embeddings length mismatch; using lexical retrieval instead."
              );
            }
          } else {
            console.info(
              "No corpus_embeddings.json; using lexical retrieval only."
            );
          }
        } catch (e) {
          console.info(
            "Failed to load embeddings; using lexical retrieval only.",
            e
          );
        }
      } catch (err: any) {
        console.error("RAG index load error", err);
        setRagError(
          "Failed to load RAG index. Ensure public/rag/corpus_chunks.json exists."
        );
      }
    })();
  }, []);

  // ========== Init WebLLM or fallback ==========
  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") {
        setEngineMode("fallback");
        return;
      }

      const hasWebGPU =
        typeof navigator !== "undefined" &&
        typeof (navigator as any).gpu !== "undefined";

      if (!hasWebGPU) {
        console.warn("WebGPU not available; using fallback mode.");
        setInitError(
          "WebGPU is not available. Running in retrieval-only RAG mode."
        );
        setEngineMode("fallback");
        return;
      }

      try {
        const selectedModel = "Llama-3.2-3B-Instruct-q4f32_1-MLC";

        const mlcEngine = await webllm.CreateMLCEngine(selectedModel, {
          initProgressCallback: (info: any) => {
            console.log("WebLLM init", info);
          },
        });

        setEngine(mlcEngine);
        setEngineMode("webllm");
      } catch (err: any) {
        console.error("WebLLM init error", err);
        setInitError(
          (err && err.message) ||
            "Failed to initialize WebLLM. Using retrieval-only RAG mode."
        );
        setEngineMode("fallback");
      }
    })();
  }, []);

  // ========== RAG retrieval ==========
  async function retrieveContext(
    query: string,
    topK = 5
  ): Promise<RagChunk[]> {
    if (!chunks || !chunks.length) return [];

    // embeddings
    if (embeddings && embeddings.length === chunks.length) {
      const qVec = simpleTextToVector(query);
      const scored = embeddings.map((vec, i) => ({
        chunk: chunks[i],
        score: cosine(qVec, vec),
      }));
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK).map((s) => s.chunk);
    }

    const q = query.toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const scored = chunks.map((c) => {
      const t = c.text.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (t.includes(w)) score += 1;
      }
      return { chunk: c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((s) => s.chunk);
  }

  // ========== Ask handler ==========
  async function handleAsk() {
    if (loadingAnswer) return; 
    if (!question.trim()) return;

    setLoadingAnswer(true);
    setAnswer("");

    try {
      if (!chunks) {
        if (ragError) {
          setAnswer(ragError);
        } else {
          setAnswer("RAG index is still loading. Please try again shortly.");
        }
        return; // finally
      }

      const ctxChunks = await retrieveContext(question);
      setLastContext(ctxChunks);

      const contextText = ctxChunks.map((c) => c.text).join("\n---\n");

      if (engineMode === "webllm" && engine) {
        // WebLLM 
        const messages: webllm.ChatCompletionMessageParam[] = [
          {
            role: "system",
            content:
              "You are a RAG assistant. Use ONLY the provided context. If the answer is not in the context, say you don't know.",
          },
          {
            role: "user",
            content:
              `CONTEXT:\n${contextText}\n\n` +
              `QUESTION:\n${question}`,
          },
        ];

        const result = await engine.chat.completions.create({
          messages,
          stream: false,
        });

        const content =
          result?.choices?.[0]?.message?.content ||
          "No answer generated by local model.";
        setAnswer(content);
      } else {
        // Fallback: retrieval
        if (!ctxChunks.length) {
          setAnswer(
            "No relevant context found in the local corpus. (fallback mode: no local LLM)"
          );
        } else {
          setAnswer(
            [
              "Local LLM is not available on this device.",
              "Showing top retrieved context chunks instead:",
              "",
              ...ctxChunks.map(
                (c, i) =>
                  `[${i + 1}] ${c.text}${
                    c.source ? `\n(source: ${c.source})` : ""
                  }`
              ),
            ].join("\n")
          );
        }
      }
    } catch (err: any) {
      console.error("Ask error", err);
      setAnswer(`Error while answering: ${err?.message || String(err)}`);
    } finally {
      setLoadingAnswer(false);
    }
  }

  // ========== Helpers ==========

  function simpleTextToVector(text: string): number[] {
    const dim = 64;
    const vec = new Array(dim).fill(0);
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    for (const w of words) {
      let h = 0;
      for (let i = 0; i < w.length; i++) {
        h = (h * 31 + w.charCodeAt(i)) >>> 0;
      }
      vec[h % dim] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => (norm ? v / norm : v));
  }

  function cosine(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (!na || !nb) return 0;
    return dot / Math.sqrt(na * nb);
  }

  // ========== UI ==========

  const statusLabel =
    engineMode === "webllm"
      ? "WebLLM Ready (WebGPU detected)"
      : engineMode === "fallback"
      ? "Fallback mode: retrieval-only RAG (no WebGPU on this device)"
      : "Loading WebLLM / probing environment...";

  const REPO_URL = "https://github.com/europanite/client_side_rag";

  return (
    <View style={{ flex: 1, padding: 16, gap: 8 }}>
      <TouchableOpacity onPress={() => Linking.openURL(REPO_URL)}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "800",
             marginBottom: 12,
            color: "#1d4ed8",
            textDecorationLine: "underline",
          }}
        >
          Client-Side RAG
        </Text>
      </TouchableOpacity>
      <Text style={styles.description}>
        This page is a client-side Retrieval-Augmented Generation (RAG) playground.
        It runs entirely in your browser on top of React Native for Web and GitHub Pages,
        so your questions and the retrieved context never leave this device.
      </Text>
      <Text style={{ fontWeight: "600" }}>{statusLabel}</Text>

      {initError && (
        <Text style={{ color: "red", marginBottom: 4 }}>{initError}</Text>
      )}
      {ragError && (
        <Text style={{ color: "red", marginBottom: 4 }}>{ragError}</Text>
      )}

      <TextInput
        placeholder="Ask about your local documents..."
        value={question}
        onChangeText={setQuestion}
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          padding: 8,
          borderRadius: 6,
          marginTop: 4,
        }}
        multiline
      />

      <Button
        title={loadingAnswer ? "Thinking..." : "Ask"}
        onPress={handleAsk}
        disabled={loadingAnswer || !question.trim()}
      />

      {loadingAnswer && (
        <View style={{ marginTop: 8 }}>
          <ActivityIndicator />
        </View>
      )}

      <ScrollView style={{ marginTop: 8, flex: 1 }}>
        {lastContext.length > 0 && (
          <View
            style={{
              marginBottom: 12,
              padding: 8,
              borderWidth: 1,
              borderColor: "#eee",
              borderRadius: 6,
            }}
          >
            <Text style={{ fontWeight: "600", marginBottom: 4 }}>
              Retrieved Context (top {lastContext.length})
            </Text>
            {lastContext.map((c, i) => (
              <Text
                key={c.id ?? i}
                style={{ fontSize: 12, marginBottom: 4 }}
              >{`[${i + 1}] ${c.text}`}</Text>
            ))}
          </View>
        )}

        <Text selectable style={{ fontSize: 14 }}>
          {answer}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
    color: "#111",
  },
  description: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
  },
});
