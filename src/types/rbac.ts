export type UserRole = 'Admin' | 'Manager' | 'Staff' | 'MIS' | 'Fleet';

export interface PermissionRules {
    // CRUD — apply per resource (any page the role can access)
    canCreateRecords: boolean;
    canEditRecords: boolean;
    canDeleteRecords: boolean;

    // System / admin
    canManageUsers: boolean;
    canViewAdminPage: boolean;
    canEditSettings: boolean;
    canExportData: boolean;
    canApproveRequests: boolean;
    canImportFileNumbers: boolean;
    canImportBeneficiaries: boolean;
    canImportServices: boolean;

    // Page-level access — keys match the tags used by SidebarMenu and RouteGuard
    // dashboard, beneficiary, services, assessments, tokens, tracking,
    // reports, exercises, settings, admin
    accessiblePages: string[];
}

export const ROLE_PERMISSIONS: Record<UserRole, PermissionRules> = {
    Admin: {
        canCreateRecords: true,
        canEditRecords: true,
        canDeleteRecords: true,
        canManageUsers: true,
        canViewAdminPage: true,
        canEditSettings: true,
        canExportData: true,
        canApproveRequests: true,
        canImportFileNumbers: true,
        canImportBeneficiaries: true,
        canImportServices: true,
        accessiblePages: [
            'dashboard', 'beneficiary', 'services', 'assessments',
            'tokens', 'tracking', 'reports', 'exercises', 'settings', 'admin'
        ]
    },
    Manager: {
        canCreateRecords: true,
        canEditRecords: true,
        canDeleteRecords: true,
        canManageUsers: false,
        canViewAdminPage: false,
        canEditSettings: true,
        canExportData: true,
        canApproveRequests: true,
        canImportFileNumbers: true,
        canImportBeneficiaries: true,
        canImportServices: true,
        accessiblePages: [
            'dashboard', 'beneficiary', 'services', 'assessments',
            'tokens', 'tracking', 'reports', 'exercises', 'settings'
        ]
    },
    Staff: {
        canCreateRecords: true,
        canEditRecords: false,
        canDeleteRecords: false,
        canManageUsers: false,
        canViewAdminPage: false,
        canEditSettings: false,
        canExportData: false,
        canApproveRequests: false,
        canImportFileNumbers: false,
        canImportBeneficiaries: false,
        canImportServices: false,
        accessiblePages: [
            'dashboard', 'beneficiary', 'services', 'assessments', 'tokens', 'settings'
        ]
    },
    MIS: {
        canCreateRecords: true,
        canEditRecords: true,
        canDeleteRecords: false,
        canManageUsers: false,
        canViewAdminPage: false,
        canEditSettings: false,
        canExportData: true,
        canApproveRequests: false,
        canImportFileNumbers: true,
        canImportBeneficiaries: true,
        canImportServices: true,
        accessiblePages: [
            'dashboard', 'beneficiary', 'services', 'assessments', 'reports', 'settings'
        ]
    },
    Fleet: {
        canCreateRecords: true,
        canEditRecords: false,
        canDeleteRecords: false,
        canManageUsers: false,
        canViewAdminPage: false,
        canEditSettings: false,
        canExportData: true,
        canApproveRequests: false,
        canImportFileNumbers: false,
        canImportBeneficiaries: false,
        canImportServices: false,
        accessiblePages: ['dashboard', 'tracking', 'settings']
    }
};

export interface UserProfile {
    id: string;
    email: string;
    full_name?: string;
    role: UserRole;
    is_active: boolean;
    department?: string;
    last_login?: string;
}
