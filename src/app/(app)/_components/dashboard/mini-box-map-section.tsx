import { getBranchContext } from "@/lib/auth/context";
import { MiniBoxMap } from "@/components/boxes/mini-box-map";

export interface MiniBoxMapCardProps {
  branchId: string;
}

export function MiniBoxMapCard({ branchId }: MiniBoxMapCardProps) {
  return <MiniBoxMap branchId={branchId} />;
}

export async function MiniBoxMapSection() {
  // El mapa compacto muestra boxes, patentes y tickets: si el usuario tiene
  // negado `box.read`, no se renderiza (el menú ya oculta la sección).
  const context = await getBranchContext();
  if (!context?.branchId) return null;
  if (!context.can("box.read")) return null;
  return <MiniBoxMapCard branchId={context.branchId} />;
}
