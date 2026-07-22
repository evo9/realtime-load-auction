export type Role = 'shipper' | 'carrier' | 'admin';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
}
