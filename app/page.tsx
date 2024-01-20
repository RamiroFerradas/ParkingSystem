import PriceCalculator from "./components/PriceCalculator";
import { getPrices } from "./services/prices";

export default async function Home() {
  const prices = await getPrices();

  return (
    <div className="container mx-auto bg-gray-900 rounded-lg shadow-md h-screen">
      <PriceCalculator prices={prices} />
    </div>
  );
}
