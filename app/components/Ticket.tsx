"use client";
import { Br, Cut, Line, Printer, Text, Row } from "react-thermal-printer";
import { useParking } from "../context/ParkingContext";
import { Price } from "../models/Price";

type Props = {
  prices: Price[];
};

const TicketPrinter = ({ prices }: Props) => {
  const { vehicle, startTime, endTime, domain } = useParking();

  const calculateTotal = (): { hours: number; totalPrice: number } | null => {
    if (!vehicle || !startTime || !endTime) {
      return null;
    }

    // Encontrar el precio del vehículo seleccionado
    const selectedPrice = prices.find((p: Price) => p.vehiculo === vehicle);

    if (!selectedPrice) {
      return null;
    }

    // Convertir las horas de inicio y fin a objetos Date para realizar cálculos
    const startDateTime = new Date(`2000-01-01T${startTime}`);
    const endDateTime = new Date(`2000-01-01T${endTime}`);

    // Obtener la diferencia en milisegundos y convertirla a horas
    const hours =
      (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);

    // Calcular el precio a pagar
    const totalPrice = hours * selectedPrice.precio;

    return { hours, totalPrice };
  };

  const totalInfo = calculateTotal();

  if (!totalInfo) {
    return (
      <div className="text-red-500">
        Por favor, completa la información para generar el ticket.
      </div>
    );
  }

  const currentDateTime = new Date();
  const entryDateTime = `${currentDateTime.toLocaleDateString()} ${startTime}`;
  const exitDateTime = `${currentDateTime.toLocaleDateString()} ${endTime}`;

  return (
    <Printer type="epson" width={42} characterSet="korea">
      <Text bold={true}>Ticket de Estacionamiento</Text>

      <Br />
      <Line />
      <Row left="DOMINIO" right={domain} />
      <Row left="ENTRADA" right={entryDateTime} />
      <Row left="SALIDA" right={exitDateTime} />
      <Row left="CATEGORÍA" right={vehicle} />
      <Row left="TIEMPO (HORAS)" right={totalInfo.hours.toFixed(2)} />
      <Row
        left="IMPORTE HORAS X PRECIO"
        right={`$${totalInfo.totalPrice.toFixed(2)}`}
      />
      <Row left="left" right="right" />
      <Row left="left" right="right" gap={2} />
      <Row left={<Text>left</Text>} right="right" />
      <Row
        left={<Text>left</Text>}
        right="very very long text will be multi line placed."
      />
      <Line />
      <Br />
      <Text align="center">Wifi: some-wifi / PW: 123123</Text>
      <Cut />
    </Printer>
  );
};

export default TicketPrinter;
