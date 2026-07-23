import { calculatePasswordStrength, PASSWORD_STRENGTH_LABELS, PASSWORD_STRENGTH_COLORS } from '@/schemas/authSchemas';
import { motion } from 'framer-motion';

export interface PasswordStrengthMeterProps {
  password?: string;
}

export function PasswordStrengthMeter({ password = '' }: PasswordStrengthMeterProps) {
  const strength = calculatePasswordStrength(password);
  const label = PASSWORD_STRENGTH_LABELS[strength];

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {[1, 2, 3, 4].map((level) => {
          const isActive = strength >= level;
          const colorClass = isActive ? PASSWORD_STRENGTH_COLORS[strength] : 'bg-transparent';
          
          return (
            <div key={level} className="h-full flex-1 border-r border-background last:border-r-0">
              <motion.div
                initial={false}
                animate={{
                  backgroundColor: isActive ? 'var(--color-' + colorClass.replace('bg-', '') + ')' : 'transparent',
                }}
                className={`h-full w-full ${colorClass}`}
                transition={{ duration: 0.3 }}
              />
            </div>
          );
        })}
      </div>
      {password.length > 0 && (
        <p className={`text-xs ${strength < 3 ? 'text-warning' : 'text-success'}`}>
          Password strength: <span className="font-medium">{label}</span>
        </p>
      )}
    </div>
  );
}

PasswordStrengthMeter.displayName = 'PasswordStrengthMeter';

export default PasswordStrengthMeter;
