import { Switch } from '@mantine/core';

interface LiveOnlyToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function LiveOnlyToggle({ checked, onChange }: LiveOnlyToggleProps) {
  return (
    <Switch
      label="Live only"
      checked={checked}
      onChange={(e) => onChange(e.currentTarget.checked)}
      color="forest"
      size="md"
    />
  );
}
