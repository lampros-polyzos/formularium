import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TwoStepVerification from './TwoStepVerification';

const mocks = vi.hoisted(() => ({
    fetchMfaStatus: vi.fn(), startMfaSetup: vi.fn(), enableMfa: vi.fn(), disableMfa: vi.fn(), newRecoveryCodes: vi.fn(), toString: vi.fn(), downloadTextFile: vi.fn(),
}));

vi.mock('../lib/mfaClient', () => ({
    fetchMfaStatus: mocks.fetchMfaStatus, startMfaSetup: mocks.startMfaSetup, enableMfa: mocks.enableMfa, disableMfa: mocks.disableMfa, newRecoveryCodes: mocks.newRecoveryCodes,
}));
vi.mock('qrcode', () => ({ default: { toString: mocks.toString } }));
vi.mock('../lib/accountData', () => ({ downloadTextFile: mocks.downloadTextFile }));

const OFF = { available: true, enabled: false, recoveryCodesLeft: 0, needsPassword: true };
const ON = { available: true, enabled: true, recoveryCodesLeft: 10, needsPassword: true };
const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF'];

beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset());
    mocks.fetchMfaStatus.mockResolvedValue(OFF);
    mocks.startMfaSetup.mockResolvedValue({ secret: 'ABCDEFGHJKLMNPQR', otpauthUri: 'otpauth://totp/Formularium:a%40b.co?secret=ABCDEFGHJKLMNPQR' });
    mocks.toString.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>');
    mocks.enableMfa.mockResolvedValue(CODES);
});
afterEach(cleanup);

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
/** For a button that appears once the status has loaded. */
const clickWhenReady = async (name: RegExp) => { fireEvent.click(await screen.findByRole('button', { name })); };

describe('TwoStepVerification', () => {
    it('shows nothing when the server cannot offer it', async () => {
        mocks.fetchMfaStatus.mockResolvedValue({ ...OFF, available: false });
        const { container } = render(<TwoStepVerification />);
        await waitFor(() => expect(mocks.fetchMfaStatus).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    it('shows nothing, instead of a broken section, when its state cannot be read', async () => {
        mocks.fetchMfaStatus.mockRejectedValue(new Error('offline'));
        const { container } = render(<TwoStepVerification />);
        await waitFor(() => expect(mocks.fetchMfaStatus).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    it('sets it up: password, QR code, first code, then the recovery codes once', async () => {
        render(<TwoStepVerification />);
        await clickWhenReady(/Set up two-step verification/i);

        type(/Your password/i, 'my password');
        click(/Continue/i);
        await waitFor(() => expect(mocks.startMfaSetup).toHaveBeenCalledWith('my password'));

        const qr = await screen.findByAltText(/QR code to scan/i);
        expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);   // an SVG, not a canvas picture: Firefox's tracking protection scrambles canvases
        expect(decodeURIComponent(qr.getAttribute('src')!)).toContain('<svg');
        // the address inside the code is the one the server made, with the standard blank border around it (what scanners need)
        expect(mocks.toString).toHaveBeenCalledWith('otpauth://totp/Formularium:a%40b.co?secret=ABCDEFGHJKLMNPQR', expect.objectContaining({ type: 'svg', margin: 4 }));
        expect(screen.getByText('ABCD EFGH JKLM NPQR')).toBeInTheDocument();   // the key to type by hand, in groups of four

        const turnOn = screen.getByRole('button', { name: /Turn on/i });
        expect(turnOn).toBeDisabled();
        type(/6-digit code/i, '12ab34 56');                                      // anything but digits is dropped
        expect(screen.getByLabelText(/6-digit code/i)).toHaveValue('123456');
        mocks.fetchMfaStatus.mockResolvedValue(ON);
        fireEvent.click(turnOn);
        await waitFor(() => expect(mocks.enableMfa).toHaveBeenCalledWith('123456'));

        const list = await screen.findByRole('list', { name: /Recovery codes/i });
        CODES.forEach(c => expect(within(list).getByText(c)).toBeInTheDocument());
        const done = screen.getByRole('button', { name: /Done/i });
        expect(done).toBeDisabled();                                             // not until they say they saved them
        fireEvent.click(screen.getByLabelText(/I have saved these codes/i));
        expect(done).toBeEnabled();
        fireEvent.click(done);

        expect(await screen.findByText(/Two-step verification is on/i)).toBeInTheDocument();
        expect(screen.getByText(/10 recovery codes left/i)).toBeInTheDocument();
    });

    it('does not ask a Google-only account for a password it does not have', async () => {
        mocks.fetchMfaStatus.mockResolvedValue({ ...OFF, needsPassword: false });
        render(<TwoStepVerification />);
        await clickWhenReady(/Set up two-step verification/i);
        await waitFor(() => expect(mocks.startMfaSetup).toHaveBeenCalledWith(undefined));
        expect(screen.queryByLabelText(/Your password/i)).not.toBeInTheDocument();
        expect(await screen.findByAltText(/QR code to scan/i)).toBeInTheDocument();
    });

    it('says why the password was refused, and stays on the password step', async () => {
        mocks.startMfaSetup.mockRejectedValue(new Error('That password is not right.'));
        render(<TwoStepVerification />);
        await clickWhenReady(/Set up two-step verification/i);
        type(/Your password/i, 'wrong');
        click(/Continue/i);
        expect(await screen.findByRole('alert')).toHaveTextContent('That password is not right.');
        expect(screen.queryByAltText(/QR code to scan/i)).not.toBeInTheDocument();
    });

    it('keeps the setup open when the first code is wrong', async () => {
        mocks.enableMfa.mockRejectedValue(new Error('That code is not right. Check the app, or use a recovery code.'));
        render(<TwoStepVerification />);
        await clickWhenReady(/Set up two-step verification/i);
        type(/Your password/i, 'pw');
        click(/Continue/i);
        await screen.findByAltText(/QR code to scan/i);
        type(/6-digit code/i, '000000');
        click(/Turn on/i);
        expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right');
        expect(screen.getByAltText(/QR code to scan/i)).toBeInTheDocument();      // the same QR code: they can try again
        expect(screen.queryByRole('list', { name: /Recovery codes/i })).not.toBeInTheDocument();
    });

    it('lets the recovery codes be copied and downloaded', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        render(<TwoStepVerification />);
        await clickWhenReady(/Set up two-step verification/i);
        type(/Your password/i, 'pw');
        click(/Continue/i);
        await screen.findByAltText(/QR code to scan/i);
        type(/6-digit code/i, '123456');
        click(/Turn on/i);
        await screen.findByRole('list', { name: /Recovery codes/i });

        click(/Copy/i);
        expect(writeText).toHaveBeenCalledWith(CODES.join('\n'));
        click(/Download/i);
        expect(mocks.downloadTextFile).toHaveBeenCalledWith('formularium-recovery-codes.txt', expect.stringContaining('AAAAA-BBBBB'));
    });

    it('turns it off only with a code', async () => {
        mocks.fetchMfaStatus.mockResolvedValue(ON);
        mocks.disableMfa.mockResolvedValue(undefined);
        render(<TwoStepVerification />);
        await clickWhenReady(/^Turn off$/i);

        const confirm = screen.getByRole('button', { name: /^Turn off$/i });
        expect(confirm).toBeDisabled();
        type(/Enter a code to turn it off/i, '123456');
        mocks.fetchMfaStatus.mockResolvedValue(OFF);
        fireEvent.click(confirm);
        await waitFor(() => expect(mocks.disableMfa).toHaveBeenCalledWith('123456'));
        expect(await screen.findByRole('button', { name: /Set up two-step verification/i })).toBeInTheDocument();
    });

    it('keeps it on, and says so, when the code to turn it off is wrong', async () => {
        mocks.fetchMfaStatus.mockResolvedValue(ON);
        mocks.disableMfa.mockRejectedValue(new Error('That code is not right. Check the app, or use a recovery code.'));
        render(<TwoStepVerification />);
        await clickWhenReady(/^Turn off$/i);
        type(/Enter a code to turn it off/i, '000000');
        fireEvent.click(screen.getByRole('button', { name: /^Turn off$/i }));
        expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right');
        expect(mocks.fetchMfaStatus).toHaveBeenCalledTimes(1);                    // nothing changed, so nothing was reloaded
    });

    it('warns when few recovery codes are left, and gets new ones with a code', async () => {
        mocks.fetchMfaStatus.mockResolvedValue({ ...ON, recoveryCodesLeft: 1 });
        mocks.newRecoveryCodes.mockResolvedValue(['NNNNN-OOOOO']);
        render(<TwoStepVerification />);
        expect(await screen.findByText(/1 recovery code left/i)).toHaveTextContent(/Get new ones before you run out/i);

        click(/Get new recovery codes/i);
        type(/Enter a code to get new recovery codes/i, 'abcde-fghij');           // a recovery code is accepted here too
        click(/Get new codes/i);
        await waitFor(() => expect(mocks.newRecoveryCodes).toHaveBeenCalledWith('abcde-fghij'));
        const list = await screen.findByRole('list', { name: /Recovery codes/i });
        expect(within(list).getByText('NNNNN-OOOOO')).toBeInTheDocument();
    });
});
