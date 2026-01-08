# BBPOS CHIPPER 3X USB Driver Installation Guide

## Quick Answer

**For most users: NO DRIVERS NEEDED** - BBPOS CHIPPER 3X is plug-and-play on Windows, Mac, and Linux.

However, if your reader is not detected, follow the steps below.

## Do You Need Drivers?

### Check First (Before Installing Drivers)

1. **Windows**:
   - Connect the reader via USB
   - Open **Device Manager** (Win + X, then select Device Manager)
   - Look under:
     - **Ports (COM & LPT)** - for serial devices
     - **Universal Serial Bus controllers** - for USB devices
     - **Other devices** - if device is not recognized
   - If you see "BBPOS" or the device appears without errors → **No drivers needed**
   - If you see yellow warning icon → **Drivers may be needed**

2. **Mac**:
   - Connect the reader via USB
   - Click Apple menu → **About This Mac** → **System Report**
   - Go to **USB** section
   - Look for "BBPOS" or similar device
   - If device appears → **No drivers needed**

3. **Linux**:
   - Connect the reader via USB
   - Run: `lsusb` in terminal
   - Look for BBPOS device
   - If device appears → **No drivers needed**

## If Drivers Are Needed

### Windows Drivers

BBPOS CHIPPER 3X may use one of these USB-to-Serial chips:

1. **CH340 Driver** (Most Common)
   - Download: [CH340 Driver](http://www.wch.cn/download/CH341SER_EXE.html)
   - Install and restart computer
   - Device should appear as COM port

2. **FTDI Driver**
   - Download: [FTDI VCP Drivers](https://ftdichip.com/drivers/vcp-drivers/)
   - Install and restart computer
   - Device should appear as COM port

3. **CP210x Driver**
   - Download: [CP210x Drivers](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
   - Install and restart computer
   - Device should appear as COM port

4. **BBPOS Official Drivers**
   - Check [BBPOS Support Website](https://www.bbpos.com/support)
   - Look for "CHIPPER 3X" drivers
   - Download and install

### Mac Drivers

Mac usually doesn't need drivers, but if needed:

1. **FTDI Driver** (if reader uses FTDI chip):
   - Download: [FTDI VCP Drivers for Mac](https://ftdichip.com/drivers/vcp-drivers/)
   - Install and restart

2. **BBPOS Official Drivers**:
   - Check [BBPOS Support Website](https://www.bbpos.com/support)
   - Download Mac-specific drivers if available

### Linux Drivers

Linux usually works without drivers, but you may need:

```bash
# Install USB serial support
sudo modprobe usbserial
sudo modprobe ch341  # For CH340 chips
sudo modprobe ftdi_sio  # For FTDI chips

# Check if device is detected
lsusb
dmesg | grep -i usb
```

## Important: Web Serial API Limitation

⚠️ **Even with drivers installed, BBPOS CHIPPER 3X may NOT work with Web Serial API** because:

1. **Different Communication Protocol**: BBPOS readers use USB HID (Human Interface Device) or proprietary protocols, not standard serial communication
2. **Designed for Accept Mobile SDK**: The reader is designed to work with Authorize.Net's Accept Mobile SDK (for native apps), not Web Serial API (for web browsers)
3. **Web Serial API Requirements**: Web Serial API only works with devices that appear as standard serial ports (COM ports on Windows)

## Recommended Solutions

### Option 1: Use Manual Entry (Recommended for Web Apps)

Since Web Serial API doesn't work reliably with BBPOS readers:

1. In the payment modal, select **"Manual Entry"** instead of "USB Card Reader"
2. Enter card details manually
3. Card data is still encrypted using Accept.js
4. **This is the most reliable solution for web applications**

### Option 2: Use Authorize.Net 2.0 Desktop App

If you need USB reader functionality:

1. Install [Authorize.Net 2.0 Desktop App](https://developer.authorize.net/)
2. Connect BBPOS reader to the desktop app
3. The app acts as a bridge between the reader and web applications
4. Requires additional integration work

### Option 3: Use Native App (Electron)

For full USB reader support:

1. Convert web app to Electron (desktop app)
2. Use Authorize.Net Accept Mobile SDK
3. Full USB reader support

## Driver Installation Steps (If Needed)

### Windows

1. **Download Driver**:
   - Identify which chip your reader uses (CH340, FTDI, or CP210x)
   - Download appropriate driver from links above

2. **Install Driver**:
   - Run installer as Administrator
   - Follow installation wizard
   - Restart computer when prompted

3. **Verify Installation**:
   - Open Device Manager
   - Connect reader
   - Check if device appears without errors
   - Note the COM port number (e.g., COM3, COM4)

4. **Test Connection**:
   - Open Device Manager
   - Right-click on the device → Properties
   - Check if device is working properly

### Mac

1. **Download Driver** (if needed):
   - Download from BBPOS or chip manufacturer

2. **Install Driver**:
   - Open downloaded .pkg file
   - Follow installation wizard
   - Enter admin password
   - Restart if prompted

3. **Verify Installation**:
   - Check System Information → USB
   - Device should appear

### Linux

1. **Install USB Serial Modules**:
   ```bash
   sudo modprobe usbserial
   sudo modprobe ch341  # or ftdi_sio, depending on chip
   ```

2. **Make Permanent**:
   ```bash
   echo "usbserial" | sudo tee -a /etc/modules
   echo "ch341" | sudo tee -a /etc/modules
   ```

3. **Verify**:
   ```bash
   lsusb
   dmesg | tail
   ```

## Troubleshooting

### Device Not Detected After Driver Installation

1. **Unplug and Replug**: Disconnect reader, wait 5 seconds, reconnect
2. **Try Different USB Port**: Use USB 2.0 port if available
3. **Try Different Cable**: USB cable may be faulty
4. **Check Power**: Ensure reader is powered (some readers need external power)
5. **Restart Computer**: After driver installation, restart is often required

### Device Detected But Web Serial API Still Doesn't Work

This is **expected behavior**. BBPOS CHIPPER 3X is not designed for Web Serial API. Use **Manual Entry** mode instead.

### Yellow Warning in Device Manager

1. **Update Driver**:
   - Right-click device → Update Driver
   - Search automatically for drivers
   - Or browse to driver location

2. **Reinstall Driver**:
   - Uninstall device from Device Manager
   - Unplug reader
   - Reinstall driver
   - Reconnect reader

## Contact Support

If drivers don't solve your issue:

- **BBPOS Support**: [https://www.bbpos.com/support](https://www.bbpos.com/support)
- **Authorize.Net Support**: [https://developer.authorize.net/](https://developer.authorize.net/)
- **Your POS Application**: Check application logs

## Summary

- **Most cases**: No drivers needed (plug-and-play)
- **If needed**: Install CH340, FTDI, or CP210x drivers
- **Web Serial API**: Won't work even with drivers (use Manual Entry instead)
- **Best solution for web apps**: Use Manual Entry mode with Accept.js encryption
