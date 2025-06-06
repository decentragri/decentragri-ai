
//** MEMGRAPH DRIVER
import { Driver, ManagedTransaction, Session, type QueryResult } from 'neo4j-driver-core'

//** UUID GENERATOR
import { nanoid } from "nanoid"

//**TYPE IMPORTS */
import type { SuccessMessage } from '../onchain.services/onchain.interface';

//**SERVICE IMPORT
import TokenService from '../security.services/token.service';
import type { BufferData, UserLoginResponse } from '../auth.services/auth.interface';
import type { LevelUpResult } from './profile.interface';
import { profilePictureCypher } from './profile.cypher';

//** CONFIG IMPORT */


class ProfileService {
    driver?: Driver
    constructor(driver?: Driver) {
      this.driver = driver
    };

    /**
     * Retrieves the profile of a user based on the provided access token.
     * @param token - The access token of the user.
     * @returns A promise that resolves to the user's profile information.
     */
    public async getProfile(token: string): Promise<UserLoginResponse> {
      const tokenService = new TokenService();
      const session = this.driver?.session();
      try {
        const username: string = await tokenService.verifyAccessToken(token);

        const result = await session?.executeRead((tx: ManagedTransaction) =>
          tx.run(
            `
            MATCH (u:User {username: $username})
            RETURN u as user
            `,
            { username }
          )
        );

        if (!result || result.records.length === 0) {
          throw new Error("User not found");
        }
        const userRecord = result.records[0].get('user');
        const userProfile: UserLoginResponse = userRecord.properties; 
        return userProfile;
        
  
      } catch (error) {
        console.error("Error getting profile:", error);
        throw error;
      }
    }

    // Calculates the experience gain for a user based on their current level and accuracy
    public async calculateExperienceGain(username: string = "nashar4", accuracy: number): Promise<LevelUpResult> {
        try {
            // Retrieve user details
            const user: UserLoginResponse = await this.getUserDetails(username);
            const { level } = user;
    
            // Calculate experience gain
            const experienceRequired: number = await this.getRequiredUserExperience(level);
            const baseExperienceGain: number = Math.floor(10 * Math.pow(level, 1.8));
            let adjustedExperienceGain: number = baseExperienceGain * (accuracy * 100);
            const minExperienceGain: number = Math.floor(experienceRequired * 0.05);
            const maxExperienceGain: number = Math.floor(experienceRequired * 0.2);
            adjustedExperienceGain = Math.max(minExperienceGain, Math.min(maxExperienceGain, adjustedExperienceGain));
    
            const experienceGained: number = Math.floor(adjustedExperienceGain);
    
            // Generate the experience and return the result
            const result: LevelUpResult = await this.generateExperience(experienceGained, user);
            await this.saveUserDetails(username, result);
            return result;
    
        } catch (error: any) {
            console.error("Error calculating experience gain:", error);
            throw error;
        }
    }
    
    // Calculates the required experience for a given level using a unified formula
    private async getRequiredUserExperience(level: number): Promise<number> {
        // Unified formula for required experience
        return Math.round(Math.pow(level, 1.8) + level * 4);
    }
    

    // Generates experience for a user, updating their level and experience points accordingly
    private async generateExperience(experienceGained: number, stats: UserLoginResponse): Promise<LevelUpResult> {
        try {
            const { level, experience } = stats;
            let currentLevel: number = level;
            let currentExperience: number = experience + experienceGained;
    
            // Loop until all experience is consumed or no level-up can occur
            while (true) {
                // Use the unified formula for required experience
                const requiredExperience: number = await this.getRequiredUserExperience(currentLevel);
    
                // Check if the user can level up
                if (currentExperience < requiredExperience) break;
    
                // Subtract required experience for the current level and increment level
                currentExperience -= requiredExperience;
                currentLevel++;
    
                console.log(`Current Level: ${currentLevel}, Required Experience: ${requiredExperience}, Current Experience: ${currentExperience}`);
            }
    
            // Return the updated level and experience
            return { currentLevel, currentExperience, experienceGained };
        } catch (error: any) {
            console.error("Error generating experience:", error);
            throw error;
        }
    }
    
    
    //Retrieves details of a user  based on the provided username.
    private async getUserDetails(username: string): Promise<UserLoginResponse> {
        const session: Session | undefined = this.driver?.session();
        try {
            // Find the user node within a Read Transaction
            const result: QueryResult | undefined = await session?.executeRead((tx: ManagedTransaction) =>
                tx.run('MATCH (u:User {username: $username}) RETURN u', { username })
            );

            if (!result || result.records.length === 0) {
                throw new Error(`User with username '${username}' not found.`);
            }

            return result.records[0].get('u');
        } catch(error: any) {
          console.log(error)
          throw error

        }
    }


    //Saves the details of a user, including player statistics, in the database.
    private async saveUserDetails(username: string, playerStats: LevelUpResult): Promise<void> {
        const session: Session | undefined = this.driver?.session();
        const { currentExperience, currentLevel } = playerStats;
    
        try {
            if (!session) {
                throw new Error("Database session could not be created.");
            }
    
            // Execute a write transaction to update the user's playerStats as a whole object
            await session.executeWrite((tx: ManagedTransaction) =>
                tx.run(
                    `
                    MATCH (u:User {username: $username}) 
                    SET u.level = $currentlevel,
                        u.experience = $experience 
                    RETURN u
                    `,
                    { username, currentLevel, experience: currentExperience }
                )
            );
        } catch (error: any) {
            console.error("Error saving user details:", error);
            throw error;
        } finally {
            await session?.close();
        }
    }



    public async uploadProfilePic(token: string, imageBuffer: BufferData,): Promise<SuccessMessage> {
      const tokenService = new TokenService();
      const session = this.driver?.session();
      try {
        const userName: string = await tokenService.verifyAccessToken(token);

        const uploadedAt: number = Date.now();
        const fileFormat: string = "png";
        const fileSize: number = 100;

        // Remove existing profile picture if it exists
        await session?.executeWrite((tx: ManagedTransaction) =>
          tx.run(
            `
            MATCH (u:User {username: $userName})-[:HAS_PROFILE_PIC]->(p:ProfilePic)
            DETACH DELETE p
            `,
            { userName }
          )
        );

        // Create a new ProfilePic node and connect to the user
        await session?.executeWrite((tx: ManagedTransaction) =>
          tx.run(
            profilePictureCypher,
            { userName, id: nanoid(), image: imageBuffer.bufferData, uploadedAt, fileFormat, fileSize }
          )
        );

        return { success: "Profile picture upload successful" };
      } catch (error: any) {
        console.error("Error updating profile picture:", error);
        throw error;
      } finally {
        await session?.close();
      }
    }



    public async getProfilePicture(userName: string): Promise<BufferData> {
      const session = this.driver?.session();
      try {
        const result = await session?.executeRead((tx: ManagedTransaction) =>
          tx.run(
            `
            MATCH (u:User {username: $userName})-[:HAS_PROFILE_PIC]->(p:ProfilePic)
            RETURN p.image AS image
            `,
            { userName }
          )
        );

        if (result && result.records.length > 0) {
          return { bufferData: result.records[0].get('image') };
        } else {
          return { bufferData: "" }; // No profile picture found
        }
      } catch (error: any) {
        console.error("Error retrieving profile picture:", error);
        throw error;
      } finally {
        await session?.close();
      }
    }



}

export default ProfileService;