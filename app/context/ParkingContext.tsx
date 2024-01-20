"use client";
import { createContext, useContext, useMemo, useState } from "react";

interface ParkingContextProps {
  vehicle: string;
  domain: string;
  startTime: string;
  endTime: string;
  setVehicle: React.Dispatch<React.SetStateAction<string>>;
  setDomain: React.Dispatch<React.SetStateAction<string>>;
  setStartTime: React.Dispatch<React.SetStateAction<string>>;
  setEndTime: React.Dispatch<React.SetStateAction<string>>;
}

const ParkingContext = createContext<ParkingContextProps | undefined>(
  undefined
);

export const ParkingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const currentHour = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const [vehicle, setVehicle] = useState<string>("");
  const [startTime, setStartTime] = useState<string>(currentHour);
  const [endTime, setEndTime] = useState<string>("");
  const [domain, setDomain] = useState<string>("");

  const contextValue = useMemo(
    () => ({
      vehicle,
      startTime,
      endTime,
      domain,
      setVehicle,
      setStartTime,
      setEndTime,
      setDomain,
    }),
    [vehicle, startTime, endTime, domain]
  );

  return (
    <ParkingContext.Provider value={contextValue}>
      {children}
    </ParkingContext.Provider>
  );
};

export const useParking = () => {
  const context = useContext(ParkingContext);
  if (!context) {
    throw new Error("useParking debe ser utilizado dentro de ParkingProvider");
  }
  return context;
};
