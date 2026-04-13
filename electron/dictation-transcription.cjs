/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

let transcriberKey = null;
let transcriberPromise = null;

async function getTransformers() {
  return import("@huggingface/transformers");
}

async function getTranscriber({ whisperModel, modelCacheDir }) {
  const { env, pipeline } = await getTransformers();

  env.allowRemoteModels = true;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  env.cacheDir = modelCacheDir;
  env.localModelPath = modelCacheDir;

  const key = `${whisperModel}:${modelCacheDir}`;
  if (transcriberPromise && transcriberKey === key) {
    return transcriberPromise;
  }

  transcriberKey = key;
  transcriberPromise = pipeline("automatic-speech-recognition", whisperModel, {
    quantized: true,
  });

  return transcriberPromise;
}

async function prepareTranscriber({ whisperModel, modelCacheDir }) {
  ensureModelCacheDir(modelCacheDir);
  await getTranscriber({ whisperModel, modelCacheDir });
}

function ensureModelCacheDir(modelCacheDir) {
  fs.mkdirSync(modelCacheDir, { recursive: true });
  return modelCacheDir;
}

function decodePcm16Wave(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const readTag = (offset) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );

  if (readTag(0) !== "RIFF" || readTag(8) !== "WAVE") {
    throw new Error("Received an invalid WAV recording.");
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < view.byteLength) {
    const chunkId = readTag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt ") {
      audioFormat = view.getUint16(chunkDataOffset, true);
      channels = view.getUint16(chunkDataOffset + 2, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
    }

    if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (audioFormat !== 1 || channels !== 1 || bitsPerSample !== 16 || dataOffset === 0) {
    throw new Error("Expected a mono 16-bit PCM WAV recording.");
  }

  const sampleCount = dataSize / 2;
  const audio = new Float32Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const value = view.getInt16(dataOffset + index * 2, true);
    audio[index] = Math.max(-1, value / 0x8000);
  }

  return audio;
}

async function transcribeRecording({ wavBase64, whisperModel, modelCacheDir }) {
  const resolvedCacheDir = ensureModelCacheDir(modelCacheDir);
  const transcriber = await getTranscriber({
    whisperModel,
    modelCacheDir: resolvedCacheDir,
  });
  const audio = decodePcm16Wave(Buffer.from(wavBase64, "base64"));
  const result = await transcriber(audio, {
    return_timestamps: false,
    chunk_length_s: 20,
    stride_length_s: 4,
    sampling_rate: 16_000,
  });

  return result?.text?.trim() ?? "";
}

function getDefaultModelCacheDir(userDataPath) {
  return path.join(userDataPath, "dictation-models");
}

module.exports = {
  getDefaultModelCacheDir,
  prepareTranscriber,
  transcribeRecording,
};
