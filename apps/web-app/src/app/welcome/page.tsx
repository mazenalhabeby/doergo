'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, MapPin, Boxes } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { locationsApi } from '@/lib/api';
import { notify } from '@/lib/toast';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { Input, Button, Label } from '@/components/ui';
import { cn } from '@/lib/utils';

// Map (Leaflet) — only loaded when "Physical location" is chosen.
const LocationPicker = dynamic(
  () => import('@/app/(dashboard)/locations/_components/location-picker'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    ),
  },
);

type SpaceType = 'workspace' | 'physical';

export default function WelcomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [name, setName] = useState('Main Office');
  const [type, setType] = useState<SpaceType>('workspace');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace('/login');
  }, [authLoading, isAuthenticated, router]);

  const submit = async () => {
    if (!name.trim()) {
      notify.error('Name your first space');
      return;
    }
    setLoading(true);
    try {
      await locationsApi.create({
        name: name.trim(),
        address: type === 'physical' ? address.trim() || undefined : undefined,
        lat: type === 'physical' ? lat ?? undefined : undefined,
        lng: type === 'physical' ? lng ?? undefined : undefined,
      });
      // Refetch the spaces cache (incl. the gate's inactive query) so the
      // dashboard sees the new space immediately — no bounce back to /welcome.
      await queryClient.refetchQueries({ queryKey: ['locations'], type: 'all' });
      notify.success('Your first space is ready!');
      router.replace('/dashboard');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Failed to create space');
    } finally {
      setLoading(false);
    }
  };

  const typeCard = (active: boolean) =>
    cn(
      'rounded-xl border p-4 text-left transition-all',
      active ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300',
    );

  return (
    <div className="force-light fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 p-4 text-slate-900 sm:p-8">
      <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-8 shadow-modal">
        <div className="mb-7 flex flex-col items-center text-center">
          <AnimatedLogo size="default" className="mb-4" />
          <h1 className="text-2xl font-semibold text-slate-900">Set up your first space</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            A space is where your tasks live — a site, a team, or a project. You can add more anytime.
          </p>
        </div>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="space-name" className="text-sm font-medium text-slate-700">Space name</Label>
            <Input
              id="space-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Office, Downtown Crew"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Type</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setType('workspace')} className={typeCard(type === 'workspace')}>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Boxes className="h-4 w-4 text-blue-600" /> Workspace
                </div>
                <p className="mt-1 text-xs text-slate-500">A team or project — no physical location.</p>
              </button>
              <button type="button" onClick={() => setType('physical')} className={typeCard(type === 'physical')}>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <MapPin className="h-4 w-4 text-blue-600" /> Physical location
                </div>
                <p className="mt-1 text-xs text-slate-500">A site with an address — for attendance clock-in.</p>
              </button>
            </div>
          </div>

          {type === 'physical' && (
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="space-address" className="text-sm font-medium text-slate-700">Address</Label>
                <Input
                  id="space-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, city"
                  className="h-11 bg-white"
                />
              </div>
              <LocationPicker
                lat={lat}
                lng={lng}
                radius={200}
                address={address}
                onLocationChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }}
                onAddressChange={setAddress}
              />
              <p className="text-xs text-slate-400">Click the map to drop a pin for the clock-in geofence (optional now — you can set it later).</p>
            </div>
          )}

          <Button
            onClick={submit}
            disabled={loading}
            className="h-11 w-full rounded-lg border-0 bg-gradient-to-r from-blue-600 to-blue-500 font-semibold text-white shadow-sm hover:from-blue-700 hover:to-blue-600"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create space & continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
