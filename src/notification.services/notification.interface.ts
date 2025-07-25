export enum NotificationType {
    SOIL_ANALYSIS_SAVED = 'SOIL_ANALYSIS_SAVED',
    NFT_MINTED = 'NFT_MINTED',
    FARM_UPDATE = 'FARM_UPDATE',
    SYSTEM_ALERT = 'SYSTEM_ALERT',
    RECOMMENDATION = 'RECOMMENDATION'
}

export interface NotificationMetadata {
    farmName?: string;
    sensorId?: string;
    nftId?: string;
    [key: string]: any;
}


export interface INotification {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    read: boolean;
    timestamp: Date;
    metadata?: NotificationMetadata;
}

export interface INotificationService {
    createNotification(notification: Omit<INotification, 'id' | 'timestamp' | 'read'>): Promise<INotification>;
    getUnreadNotifications(userId: string): Promise<INotification[]>;
    getNotificationById(notificationId: string): Promise<INotification | null>;
    markAsRead(notificationId: string): Promise<boolean>;
    sendRealTimeNotification(userId: string, notification: Omit<INotification, 'id' | 'timestamp' | 'read' | 'userId'>): Promise<void>;
}
