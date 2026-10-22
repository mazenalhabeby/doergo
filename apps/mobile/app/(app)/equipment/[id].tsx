import { useLocalSearchParams } from 'expo-router';
import { RegisterRecord } from '@/features/register/register-record';

/** One piece of equipment from the register — the screen lives in `src/components/register/`. */
export default function EquipmentRecordRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RegisterRecord key={id} id={id} />;
}
