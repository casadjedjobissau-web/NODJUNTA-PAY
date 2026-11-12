import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Button } from "../../components/Button";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/api";
import { base64ByteLength, base64ToArrayBuffer } from "../../lib/base64";
import {
  KYC_BUCKET,
  MAX_PHOTO_BYTES,
  documentTypeLabel,
  kindLabel,
  kycErrorMessage,
  nextLevel,
  photoContentType,
  requiredKinds,
  submissionStatusLabel,
  type KycKind,
} from "../../lib/kyc";
import { supabase } from "../../lib/supabase";
import type { KycStatusView, KycSubmissionView, UploadTarget } from "../../lib/types";
import { colors, fontSize, radius, spacing } from "../../theme";

type ChosenDocument = "id_card" | "passport";

export default function KycScreen() {
  const [status, setStatus] = useState<KycStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<ChosenDocument>("id_card");
  const [busy, setBusy] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<KycKind[]>([]);

  const load = useCallback(async () => {
    try {
      setError(null);
      setStatus(await api.request<KycStatusView>("/v1/kyc"));
    } catch (err) {
      setError(kycErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const submission = status?.submission ?? null;
  const target = status ? nextLevel(status.kycLevel) : null;

  async function onCreate() {
    if (target === null) {
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const created = await api.request<KycSubmissionView>("/v1/kyc/submissions", {
        method: "POST",
        body: { targetLevel: target, documentType },
      });
      setUploaded([]);
      setStatus((previous) => (previous ? { ...previous, submission: created } : previous));
    } catch (err) {
      setError(kycErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function onCapture(kind: KycKind) {
    if (!submission) {
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError("Precisamos da câmara para fotografar o documento. Ative-a nas definições do telemóvel.");
        return;
      }

      // Só câmara (não galeria): garante fotos novas e em formato JPEG.
      const picked = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.5,
        base64: true,
        cameraType: kind === "selfie" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      });
      if (picked.canceled) {
        return;
      }

      const asset = picked.assets[0];
      if (!asset || !asset.base64) {
        setError("Não foi possível ler a fotografia. Tente novamente.");
        return;
      }
      const contentType = photoContentType(asset.mimeType);
      if (!contentType) {
        setError("Formato de foto não suportado. Use JPEG ou PNG.");
        return;
      }
      if (base64ByteLength(asset.base64) > MAX_PHOTO_BYTES) {
        setError("A foto é demasiado grande (máximo 5 MB). Tire-a de novo.");
        return;
      }

      const response = await api.request<{ targets: UploadTarget[] }>(
        `/v1/kyc/submissions/${submission.id}/upload-urls`,
        { method: "POST", body: { kinds: [kind] } },
      );
      const uploadTarget = response.targets[0];
      if (!uploadTarget) {
        setError("Não foi possível preparar o envio. Tente novamente.");
        return;
      }

      const { error: uploadError } = await supabase.storage
        .from(KYC_BUCKET)
        .uploadToSignedUrl(uploadTarget.path, uploadTarget.token, base64ToArrayBuffer(asset.base64), {
          contentType,
        });
      if (uploadError) {
        setError("Falha ao enviar a foto. Verifique a ligação e tente novamente.");
        return;
      }

      setUploaded((previous) => (previous.includes(kind) ? previous : [...previous, kind]));
    } catch (err) {
      setError(kycErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function onSubmit() {
    if (!submission) {
      return;
    }
    setBusy("submit");
    setError(null);
    try {
      const updated = await api.request<KycSubmissionView>(`/v1/kyc/submissions/${submission.id}/submit`, {
        method: "POST",
      });
      setStatus((previous) => (previous ? { ...previous, submission: updated } : previous));
    } catch (err) {
      setError(kycErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.label}>Nível de verificação atual</Text>
        <Text style={styles.value}>Nível {status?.kycLevel ?? 0}</Text>
        {submission ? (
          <>
            <Text style={styles.label}>Último pedido</Text>
            <Text style={styles.value}>
              Nível {submission.targetLevel} · {submissionStatusLabel(submission.status)}
            </Text>
          </>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {submission?.status === "pending" ? (
        <Text style={styles.text}>O seu pedido está em análise. Avisamos quando houver uma decisão.</Text>
      ) : null}

      {submission?.status === "draft" ? (
        <>
          <Text style={styles.title}>
            Pedido para o nível {submission.targetLevel} ({documentTypeLabel(submission.documentType)})
          </Text>
          <Text style={styles.text}>
            Tire as fotos pedidas com boa luz e com o documento inteiro visível. Se já enviou todas, pode submeter.
          </Text>
          {requiredKinds(submission.documentType).map((kind) => (
            <View key={kind} style={styles.photoRow}>
              <Text style={styles.photoLabel}>
                {uploaded.includes(kind) ? "✓ " : ""}
                {kindLabel(kind)}
              </Text>
              <Button
                title={uploaded.includes(kind) ? "Repetir foto" : "Tirar foto"}
                onPress={() => void onCapture(kind)}
                loading={busy === kind}
                disabled={busy !== null && busy !== kind}
                variant="secondary"
              />
            </View>
          ))}
          <Button
            title="Submeter para análise"
            onPress={() => void onSubmit()}
            loading={busy === "submit"}
            disabled={busy !== null && busy !== "submit"}
          />
        </>
      ) : null}

      {submission?.status !== "pending" && submission?.status !== "draft" ? (
        <>
          {submission?.status === "rejected" ? (
            <Text style={styles.error}>
              O último pedido foi recusado{submission.reviewReason ? `: ${submission.reviewReason}` : "."} Pode
              fazer um novo pedido.
            </Text>
          ) : null}

          {target === null ? (
            <Text style={styles.text}>Já tem o nível máximo de verificação.</Text>
          ) : (
            <>
              <Text style={styles.title}>Pedir o nível {target}</Text>
              <Text style={styles.text}>Escolha o documento que vai usar:</Text>
              <View style={styles.choices}>
                {(["id_card", "passport"] as const).map((option) => (
                  <View key={option} style={styles.choice}>
                    <Button
                      title={documentTypeLabel(option)}
                      onPress={() => setDocumentType(option)}
                      variant={documentType === option ? "primary" : "secondary"}
                    />
                  </View>
                ))}
              </View>
              <Button title={`Pedir nível ${target}`} onPress={() => void onCreate()} loading={busy === "create"} />
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  label: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: "600", marginTop: spacing.sm },
  value: { fontSize: fontSize.body, color: colors.text, fontWeight: "700" },
  title: { fontSize: fontSize.title, fontWeight: "700", color: colors.text },
  text: { fontSize: fontSize.body, color: colors.textMuted },
  error: { color: colors.danger, fontSize: fontSize.body },
  photoRow: { gap: spacing.xs },
  photoLabel: { fontSize: fontSize.body, fontWeight: "700", color: colors.text },
  choices: { gap: spacing.sm },
  choice: { flexGrow: 1 },
});
