import GasOrderFlow from "./gas-order-flow";
import ShopSection from "./Shop";

export default function Page() {
  return (
    <main className="bg-white py-6 px-4 flex flex-col items-center justify-between">
      <div className="w-full max-w-95 flex flex-col items-center gap-7">
        <GasOrderFlow />
        <ShopSection />
      </div>
    </main>
  );
}
