import { nanoid } from "nanoid";
import { Driver, Session } from "neo4j-driver";
import { getDriver } from "../db/memgraph";
import { NotificationType } from "./notification.interface";
import type { INotification, INotificationService } from "./notification.interface";
import { NotificationQueries } from "./notification.cypher";

export class NotificationService implements INotificationService {
    private static instance: NotificationService;
    

    public static getInstance(): NotificationService {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService();
        }
        return NotificationService.instance;
    }

    private async executeQuery<T = any>(query: string, params: Record<string, any>, readOnly: boolean = true): Promise<T> {
        const session = getDriver().session();
        try {
            const result = await (readOnly 
                ? session.executeRead(tx => tx.run(query, params))
                : session.executeWrite(tx => tx.run(query, params)));
            
            const records = result.records.map(record => record.get(0)?.properties || record.get(0));
            return records as unknown as T;
        } catch (error) {
            console.error('Database operation failed:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    public async createNotification(notification: Omit<INotification, 'id' | 'timestamp' | 'read'>): Promise<INotification> {
        const newNotification: INotification = {
            ...notification,
            id: nanoid(),
            timestamp: new Date(),
            read: false
        };

        try {
            await this.executeQuery(
                NotificationQueries.SAVE,
                {
                    userId: newNotification.userId,
                    id: newNotification.id,
                    type: newNotification.type,
                    title: newNotification.title,
                    message: newNotification.message,
                    read: newNotification.read,
                    timestamp: newNotification.timestamp.toISOString(),
                    metadata: newNotification.metadata || {}
                },
                false
            );
            
            return newNotification;
        } catch (error) {
            console.error('Failed to save notification:', error);
            throw new Error('Failed to save notification');
        }
    }

    public async getUnreadNotifications(userId: string): Promise<INotification[]> {
        try {
            const result: INotification[] = await this.executeQuery<INotification[]>(NotificationQueries.GET_UNREAD, { userId });
            return result.map(record => ({
                ...record,
                timestamp: new Date(record.timestamp.toString())
            }));
        } catch (error) {
            console.error('Failed to fetch unread notifications:', error);
            return [];
        }
    }

    public async markAsRead(notificationId: string): Promise<boolean> {
        try {
            const result = await this.executeQuery(NotificationQueries.MARK_AS_READ, { notificationId }, false);
            return result.length > 0;
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
            return false;
        }
    }

    public async getNotificationById(notificationId: string): Promise<INotification | null> {
        try {
            const result: INotification[] = await this.executeQuery<INotification[]>(NotificationQueries.GET_BY_ID, { notificationId });
            if (result.length === 0) return null;
            
            const notification = result[0];
            return {
                ...notification,
                timestamp: new Date(notification.timestamp.toString())
            };
        } catch (error) {
            console.error('Failed to fetch notification:', error);
            return null;
        }
    }

    public async sendRealTimeNotification(
        userId: string, 
        notification: Omit<INotification, 'id' | 'timestamp' | 'read' | 'userId'>
    ): Promise<void> {
        try {
            await this.createNotification({...notification, userId});

            console.log(`[Real-time Notification] ${notification.title} - ${notification.message}`);
            
            // In a real implementation, you would send this via WebSocket
            // this.websocketServer.to(userId).emit('notification', fullNotification);
        } catch (error) {
            console.error('Failed to send real-time notification:', error);
            // Don't rethrow to prevent breaking the main operation
        }
    }
}

export const notificationService = NotificationService.getInstance();
