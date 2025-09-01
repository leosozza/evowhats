
import { evolutionApi } from "@/lib/evolutionApi";

type LineParams = { lineId: string; lineName?: string };

export async function ensureLineSession(params: LineParams) {
  return evolutionApi.ensureSession(params.lineId);
}

export async function startSessionForLine(params: LineParams) {
  return evolutionApi.startSession(params.lineId);
}

export async function getStatusForLine(params: LineParams) {
  return evolutionApi.getStatus(params.lineId);
}

export async function getQrForLine(params: LineParams) {
  return evolutionApi.getQr(params.lineId);
}

export async function testSendMessage(lineId: string, to: string, text?: string) {
  return evolutionApi.testSend(lineId, to, text);
}

export async function bindLineToChannel(instanceId: string, lineId: string) {
  return evolutionApi.bindLine(instanceId, lineId);
}
