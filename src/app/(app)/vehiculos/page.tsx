import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui/access-denied";
import { VehiclesList } from "./vehicles-list";

export default async function VehiculosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(user!, "vehicle.read_all"))) {
    return (
      <AccessDenied message="Solo el administrador y supervisores pueden ver el listado de vehículos." />
    );
  }
  return <VehiclesList />;
}
