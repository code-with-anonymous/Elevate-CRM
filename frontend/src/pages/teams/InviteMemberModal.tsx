import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import authService from '@/services/api/authService';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InviteMemberModal({ isOpen, onClose }: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const queryClient = useQueryClient();

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; role: string }) => authService.inviteUser(data),
    onSuccess: () => {
      toast.success('Invitation sent successfully!');
      setEmail('');
      setRole('member');
      onClose();
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to send invite'),
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-card border border-border p-6 shadow-xl text-foreground">
        <h2 className="text-xl font-bold">Invite Team Member</h2>
        <p className="mt-1 text-sm text-muted-foreground">They will receive an email to join your workspace.</p>
        
        <form 
          onSubmit={(e) => { 
            e.preventDefault(); 
            inviteMutation.mutate({ email, role }); 
          }} 
          className="mt-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-muted-foreground">Email Address</label>
            <input 
              type="email" 
              required 
              placeholder="colleague@company.com" 
              className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-muted-foreground">Role</label>
            <select 
              className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none"
              value={role} 
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={inviteMutation.isPending} 
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {inviteMutation.isPending ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}