/* Car skins — all original, unlockable with data chips. */
export const SKINS = [
  { id: 'aurora',  name: 'AURORA VORTEX', cost: 0,   primary: '#FF2A85', secondary: '#7209B7', glass: '#1A1030', glow: '#00F5D4' },
  { id: 'circuit', name: 'CYAN CIRCUIT',  cost: 75,  primary: '#00F5D4', secondary: '#0077B6', glass: '#06202A', glow: '#FF2A85' },
  { id: 'solar',   name: 'SOLAR FLARE',   cost: 200, primary: '#FACC15', secondary: '#EA580C', glass: '#2A1A06', glow: '#FF3B5C' },
  { id: 'void',    name: 'VOID PHANTOM',  cost: 500, primary: '#A78BFA', secondary: '#4C1D95', glass: '#100B26', glow: '#FACC15' }
];

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}
