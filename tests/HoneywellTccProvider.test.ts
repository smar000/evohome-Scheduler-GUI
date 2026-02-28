import { HoneywellTccProvider } from '../src/providers/HoneywellTccProvider';
import axios from 'axios';
import fs from 'fs';

jest.mock('axios');
jest.mock('fs');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('HoneywellTccProvider', () => {
    let provider: HoneywellTccProvider;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedFs.existsSync.mockReturnValue(false); // No session file
        provider = new HoneywellTccProvider('user', 'pass');
        (axios.create as jest.Mock).mockReturnValue(axios);
    });

    it('should initialize and fetch data on first login', async () => {
        // Mock token response
        mockedAxios.post.mockResolvedValueOnce({
            data: {
                access_token: 'at',
                refresh_token: 'rt',
                token_type: 'bearer',
                expires_in: 3600
            }
        });

        // Mock userAccount response
        mockedAxios.get.mockResolvedValueOnce({ data: { userId: 'uid' } });

        // Mock installationInfo response
        mockedAxios.get.mockResolvedValueOnce({
            data: [{
                locationInfo: { locationId: 'lid' },
                gateways: [{
                    temperatureControlSystems: [{
                        systemId: 'sid',
                        zones: [],
                        dhw: { dhwId: 'did' }
                    }]
                }]
            }]
        });

        await provider.initialize();

        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/userAccount'));
        
        const info = provider.getSessionInfo();
        expect(info.userId).toBe('uid');
        expect(info.locationId).toBe('lid');
    });
});
