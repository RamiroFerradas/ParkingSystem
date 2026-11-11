import { useState } from "react";

type Props = {};
const useParking = (props: Props) => {
  const currentHour = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const [vehicle, setVehicle] = useState<string>("");
  const [startTime, setStartTime] = useState<string>(currentHour);
  const [endTime, setEndTime] = useState<string>("");
  const [domain, setDomain] = useState<string>("");

  return <div>useParking</div>;
};
export default useParking;
