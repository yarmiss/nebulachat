/**
 * WebRTC Client for Video/Audio Calls
 */

export class WebRTCClient {
  constructor(wsClient) {
    this.wsClient = wsClient;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isVideoEnabled = true;
    this.isAudioEnabled = true;
    this.callType = null; // 'video' or 'audio'
    this.targetUserId = null;
    
    this.configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  /**
   * Start a call (video or audio)
   * @param {string} targetUserId - User ID to call
   * @param {string} callType - 'video' or 'audio'
   */
  async startCall(targetUserId, callType = 'video') {
    this.targetUserId = targetUserId;
    this.callType = callType;

    try {
      // Get user media
      await this.getUserMedia(callType === 'video');

      // Create peer connection
      this.createPeerConnection();

      // Add local stream to peer connection
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Create and send offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Send offer through WebSocket
      this.wsClient.send('CALL_OFFER', {
        targetUserId,
        offer: offer,
        callType
      });

      return { localStream: this.localStream };
    } catch (error) {
      console.error('Error starting call:', error);
      throw error;
    }
  }

  /**
   * Answer incoming call
   * @param {Object} offer - SDP offer
   * @param {string} callerId - Caller user ID
   * @param {string} callType - 'video' or 'audio'
   */
  async answerCall(offer, callerId, callType = 'video') {
    this.targetUserId = callerId;
    this.callType = callType;

    try {
      await this.getUserMedia(callType === 'video');
      this.createPeerConnection();

      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.wsClient.send('CALL_ANSWER', {
        targetUserId: callerId,
        answer: answer
      });

      return { localStream: this.localStream };
    } catch (error) {
      console.error('Error answering call:', error);
      throw error;
    }
  }

  /**
   * Handle incoming answer
   * @param {Object} answer - SDP answer
   */
  async handleAnswer(answer) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  /**
   * Handle ICE candidate
   * @param {Object} candidate - ICE candidate
   */
  async handleIceCandidate(candidate) {
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }

  /**
   * Get user media (camera/microphone)
   * @param {boolean} video - Enable video
   */
  async getUserMedia(video = true) {
    try {
      const constraints = {
        audio: true,
        video: video ? {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } : false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.localStream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw new Error('Не удалось получить доступ к камере/микрофону');
    }
  }

  /**
   * Create peer connection
   */
  createPeerConnection() {
    this.peerConnection = new RTCPeerConnection(this.configuration);

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      this.emit('remoteStream', this.remoteStream);
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.wsClient.send('ICE_CANDIDATE', {
          targetUserId: this.targetUserId,
          candidate: event.candidate
        });
      }
    };

    // Handle connection state
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection.connectionState);
      this.emit('connectionStateChange', this.peerConnection.connectionState);

      if (this.peerConnection.connectionState === 'connected') {
        this.emit('connected');
      } else if (this.peerConnection.connectionState === 'disconnected' || 
                 this.peerConnection.connectionState === 'failed') {
        this.emit('disconnected');
      }
    };
  }

  /**
   * Toggle video
   */
  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        this.isVideoEnabled = videoTrack.enabled;
        return this.isVideoEnabled;
      }
    }
    return false;
  }

  /**
   * Toggle audio
   */
  toggleAudio() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        this.isAudioEnabled = audioTrack.enabled;
        return this.isAudioEnabled;
      }
    }
    return false;
  }

  /**
   * Share screen
   */
  async shareScreen() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always'
        },
        audio: false
      });

      const screenTrack = screenStream.getVideoTracks()[0];

      // Replace video track with screen track
      const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(screenTrack);
      }

      // When screen sharing stops, switch back to camera
      screenTrack.onended = () => {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
      };

      return true;
    } catch (error) {
      console.error('Error sharing screen:', error);
      return false;
    }
  }

  /**
   * End call
   */
  endCall() {
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Notify other user
    if (this.targetUserId) {
      this.wsClient.send('CALL_END', {
        targetUserId: this.targetUserId
      });
    }

    this.targetUserId = null;
    this.remoteStream = null;
    this.emit('callEnded');
  }

  /**
   * Event emitter
   */
  emit(event, data) {
    if (this.handlers && this.handlers[event]) {
      this.handlers[event].forEach(handler => handler(data));
    }
  }

  /**
   * Subscribe to events
   */
  on(event, handler) {
    if (!this.handlers) {
      this.handlers = {};
    }
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(handler);
  }
}

