import PriceCalculator from "./components/PriceCalculator";
import { getPrices } from "./services/prices";

export default async function Home() {
  const prices = await getPrices();

  return <PriceCalculator prices={prices} />;
}
