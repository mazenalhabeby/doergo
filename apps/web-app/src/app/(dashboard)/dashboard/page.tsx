'use client';

import { Card, CardContent } from '@/components/ui';
import { ClipboardList, Clock, CheckCircle, AlertCircle, Users, UserCheck } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

// Stats for CLIENT role
const clientStats = [
  {
    name: 'Total Tasks',
    value: '24',
    icon: ClipboardList,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    name: 'In Progress',
    value: '8',
    icon: Clock,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    name: 'Completed',
    value: '14',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    name: 'Pending',
    value: '2',
    icon: AlertCircle,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
];

// Stats for DISPATCHER role
const dispatcherStats = [
  {
    name: 'Active Tasks',
    value: '24',
    change: '+12%',
    changeType: 'increase' as const,
    icon: ClipboardList,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    name: 'Technicians Online',
    value: '8',
    change: '2 offline',
    changeType: 'neutral' as const,
    icon: Users,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    name: 'Completed Today',
    value: '12',
    change: '+3',
    changeType: 'increase' as const,
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    name: 'Pending Assignment',
    value: '6',
    change: '-2',
    changeType: 'decrease' as const,
    icon: UserCheck,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
];

// CLIENT Dashboard View
function ClientDashboard() {
  return (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {clientStats.map((stat) => (
          <Card key={stat.name}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{stat.name}</p>
                  <p className="text-2xl font-semibold text-slate-800">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Tasks Placeholder */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Recent Tasks</h3>
          <div className="text-center py-8 text-slate-500">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>No recent tasks</p>
            <p className="text-sm mt-1">Your tasks will appear here once created</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// DISPATCHER Dashboard View
function DispatcherDashboard() {
  return (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {dispatcherStats.map((stat) => (
          <Card key={stat.name}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{stat.name}</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-semibold text-slate-800">{stat.value}</p>
                    {stat.change && (
                      <span
                        className={`text-sm font-medium ${
                          stat.changeType === 'increase'
                            ? 'text-green-600'
                            : stat.changeType === 'decrease'
                            ? 'text-red-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {stat.change}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tasks */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-slate-800 mb-4">Recent Tasks</h3>
            <div className="text-center py-8 text-slate-500">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No recent tasks</p>
              <p className="text-sm mt-1">Tasks will appear here once created</p>
            </div>
          </CardContent>
        </Card>

        {/* Technician Activity */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-slate-800 mb-4">Technician Activity</h3>
            <div className="text-center py-8 text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No technician activity</p>
              <p className="text-sm mt-1">Technician updates will appear here</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isDispatcher = user?.role === 'DISPATCHER';

  const welcomeMessage = isDispatcher
    ? "Here's what's happening with your tasks today."
    : "Here's an overview of your tasks and activities.";

  return (
    <div className="p-6">
      {/* Welcome */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-slate-800">
          Welcome back, {user?.firstName}!
        </h2>
        <p className="text-slate-500 mt-1">{welcomeMessage}</p>
      </div>

      {/* Role-based Dashboard */}
      {isDispatcher ? <DispatcherDashboard /> : <ClientDashboard />}
    </div>
  );
}
