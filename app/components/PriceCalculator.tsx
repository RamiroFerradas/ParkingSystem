"use client";
import { Price } from "../models/Price";
import { useParking } from "../context/ParkingContext";
import TicketPrinter from "./Ticket";
import ReactDOMServer from "react-dom/server";

type Props = {
  prices: Price[];
};
function PriceCalculator({ prices }: Props) {
  const {
    vehicle,
    startTime,
    endTime,
    domain,
    setVehicle,
    setStartTime,
    setEndTime,
    setDomain,
  } = useParking();

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartTime(e.target.value);
  };

  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndTime(e.target.value);
  };

  const handleVehicleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setVehicle(e.target.value);
  };

  const handleDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDomain(e.target.value.toUpperCase());
  };

  const calculateTotal = (): string | JSX.Element => {
    if (!vehicle || !startTime || !endTime) {
      return (
        <p className="text-red-300">{"Por favor, completa la información."}</p>
      );
    }

    // Encontrar el precio del vehículo seleccionado
    const selectedPrice = prices.find((p) => p.vehiculo === vehicle);

    if (!selectedPrice) {
      return "No se encontró el precio para el vehículo seleccionado.";
    }

    // Convertir las horas de inicio y fin a objetos Date para realizar cálculos
    const startDateTime = new Date(`2000-01-01T${startTime}`);
    const endDateTime = new Date(`2000-01-01T${endTime}`);

    // Obtener la diferencia en milisegundos y convertirla a horas
    const hours =
      (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);

    // Calcular el precio a pagar
    const totalPrice = hours * selectedPrice.precio;

    return `Total de horas: ${hours.toFixed(
      2
    )}, Precio a pagar: ${totalPrice.toFixed(2)}`;
  };
  const printTicket = async (writer: WritableStreamDefaultWriter) => {
    // Renderiza el componente TicketPrinter en un fragmento
    const ticketString = ReactDOMServer.renderToString(
      <TicketPrinter prices={prices} />
    );

    // Escribe la cadena en la impresora
    await writer.write(ticketString);
  };

  const handlePrint = async () => {
    try {
      const port = await (navigator as any).serial?.requestPort();
      await port.open({ baudRate: 9600 });

      const writer = port.writable?.getWriter();
      if (writer != null) {
        // Llama a la función que renderiza e imprime el ticket
        await printTicket(writer);
        writer.releaseLock();
      }
    } catch (error) {
      console.error("Error al imprimir el ticket:", error);
    }
  };

  return (
    <div className="text-white flex flex-col p-4 md:p-10 container bg-gray-800 h-screen w-screen items-center md:items-start">
      <h1 className="text-3xl font-bold mb-6">Estacionamiento</h1>
      <section className="flex flex-col mb-10">
        <div className="flex flex-col space-y-4 md:w-[400px]">
          <div className="flex items-center space-x-4">
            <label className="text-lg">Tipo de vehículo:</label>
            <select
              className="p-2 border border-gray-300 text-black rounded w-32"
              onChange={handleVehicleChange}
              value={vehicle}
            >
              {prices.map((price) => (
                <option key={price.id} value={price.vehiculo}>
                  {price.vehiculo}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-9">
            <label className="text-lg">Hora de inicio:</label>
            <input
              type="time"
              className="p-2 border border-gray-300 text-black rounded w-32"
              onChange={handleStartTimeChange}
              value={startTime}
            />
          </div>
          <div className="flex items-center space-x-14">
            <label className="text-lg">Hora de fin:</label>
            <input
              type="time"
              className="p-2 border border-gray-300 text-black rounded w-32"
              onChange={handleEndTimeChange}
              value={endTime}
            />
          </div>
          <div className="flex items-center space-x-20">
            <label className="text-lg">Dominio:</label>
            <input
              type="text"
              className="p-2 border border-gray-300 text-black rounded w-32"
              onChange={handleDomainChange}
              value={domain}
            />
          </div>
        </div>
        <div className="text-lg mt-6">{calculateTotal()}</div>
      </section>
      <section>
        <button
          className="bg-white text-gray-800 rounded-md w-32 p-2 font-bold uppercase"
          onClick={handlePrint}
        >
          Imprimir Ticket
        </button>
      </section>
    </div>
  );
}

export default PriceCalculator;
