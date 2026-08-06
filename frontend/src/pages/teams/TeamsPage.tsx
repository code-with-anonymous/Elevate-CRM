import { useState } from 'react';
import { 
  Users, UserPlus, Search, Shield, 
  Crown, Eye, UserCog 
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import InviteMemberModal from '@/pages/teams/InviteMemberModal';

// Role configuration for badges
const ROLES = [
  { value: 'owner', label: 'Owner', icon: Crown, color: 'bg-purple-100 text-purple-700' },
  { value: 'admin', label: 'Admin', icon: Shield, color: 'bg-blue-100 text-blue-700' },
  { value: 'manager', label: 'Manager', icon: UserCog, color: 'bg-orange-100 text-orange-700' },
  { value: 'member', label: 'Member', icon: Users, color: 'bg-gray-100 text-gray-700' },
  { value: 'viewer', label: 'Viewer', icon: Eye, color: 'bg-green-100 text-green-700' },
];

export default function TeamsPage() {
  const user = useAuthStore((s) => s.user);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // ✅ TEMPORARY MOCK DATA: Shows only the logged-in user until backend is ready
  // This prevents the "no members" error while you build the backend!
  const members = user ? [{
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    isActive: true,
  }] : [];

  // --- Helpers ---
  const getRoleConfig = (role: string) => ROLES.find(r => r.value === role?.toLowerCase()) || ROLES[3];

  const filteredMembers = members.filter((u: any) =>
    `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-indigo-600" />
            Team Members
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage your team members and their account permissions.</p>
        </div>
        <button
          onClick={() => setIsInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Invite Member
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search members by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-16 text-center">
                  <Users className="mx-auto h-12 w-12 text-gray-300" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No team members</h3>
                  <p className="mt-1 text-sm text-gray-500">Get started by inviting a team member.</p>
                </td>
              </tr>
            ) : (
              filteredMembers.map((u: any) => {
                const roleConfig = getRoleConfig(u.role);
                const RoleIcon = roleConfig.icon;
                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    {/* User Info */}
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600 font-semibold">
                          {u.avatarUrl ? (
                            <img src={u.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                          ) : (
                            `${u.firstName?.[0] || ''}${u.lastName?.[0] || ''}`
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{u.firstName} {u.lastName}</div>
                          <div className="text-sm text-gray-500">{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role Badge (Locked for Owner) */}
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${roleConfig.color}`}>
                        <RoleIcon className="h-3 w-3" />
                        {roleConfig.label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                        <div className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-400" />
                        Active
                      </span>
                    </td>

                    {/* Actions (Empty for owner) */}
                    <td className="whitespace-nowrap px-6 py-4 text-right text-gray-300">
                       {/* You can't remove yourself */}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Invite Modal Integration */}
      <InviteMemberModal 
        isOpen={isInviteOpen} 
        onClose={() => setIsInviteOpen(false)} 
      />
    </div>
  );
}