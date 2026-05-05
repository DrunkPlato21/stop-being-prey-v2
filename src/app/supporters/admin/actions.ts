"use server";

import { revalidatePath } from "next/cache";
import { deleteEntry, updateEntry } from "@/lib/supporters";

export async function toggleVisibilityAction(formData: FormData) {
  const id = formData.get("id");
  const next = formData.get("visible");
  if (typeof id !== "string") return;
  await updateEntry(id, { visible: next === "true" });
  revalidatePath("/supporters/admin");
  revalidatePath("/supporters");
}

export async function toggleApprovedAction(formData: FormData) {
  const id = formData.get("id");
  const next = formData.get("approved");
  if (typeof id !== "string") return;
  await updateEntry(id, { approved: next === "true" });
  revalidatePath("/supporters/admin");
  revalidatePath("/supporters");
}

export async function updateAttributionAction(formData: FormData) {
  const id = formData.get("id");
  const attribution = formData.get("attribution");
  if (typeof id !== "string" || typeof attribution !== "string") return;
  const trimmed = attribution.trim().slice(0, 200);
  if (!trimmed) return;
  await updateEntry(id, { attribution: trimmed });
  revalidatePath("/supporters/admin");
  revalidatePath("/supporters");
}

export async function deleteEntryAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await deleteEntry(id);
  revalidatePath("/supporters/admin");
  revalidatePath("/supporters");
}
