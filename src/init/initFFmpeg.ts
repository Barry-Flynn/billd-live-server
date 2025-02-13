import { exec, spawnSync } from 'child_process';

import { PROJECT_ENV, PROJECT_ENV_ENUM } from '@/constant';
import srsController from '@/controller/srs.controller';
import { initUser } from '@/init/initUser';
import { BILIBILI_LIVE_PUSH_KEY } from '@/secret/secret';
import liveService from '@/service/live.service';
import liveRoomService from '@/service/liveRoom.service';
import {
  LiveRoomPullIsShouldAuthEnum,
  LiveRoomTypeEnum,
  LiveRoomUseCDNEnum,
} from '@/types/ILiveRoom';
import { chalkERROR, chalkSUCCESS, chalkWARN } from '@/utils/chalkTip';
import { tencentcloudUtils } from '@/utils/tencentcloud';

export function pushToBilibili() {
  let listFile = '/Users/huangshuisheng/Movies/Videos/list.txt';
  if (PROJECT_ENV === PROJECT_ENV_ENUM.prod) {
    listFile = '/node/video/list.txt';
  }
  const cmd = `ffmpeg -threads 1 -readrate 1 -stream_loop -1 -f concat -safe 0 -i '${listFile}' -vcodec h264 -acodec aac -f flv '${BILIBILI_LIVE_PUSH_KEY}'`;
  console.log(cmd);
  try {
    exec(cmd);
    console.log(chalkSUCCESS(`FFmpeg推流到bilibili成功`));
  } catch (error) {
    console.log(chalkERROR(`FFmpeg推流到bilibili失败`));
    console.log(error);
  }
}

function ffmpegIsInstalled() {
  const res = spawnSync('ffmpeg', ['-version']);
  // console.log('ffmpegIsInstalled', res, res.status);
  if (res.status !== 0) {
    return false;
  }
  return true;
}

async function addLive({
  live_room_id,
  user_id,
  name,
  desc,
  cdn,
  weight,
  pull_is_should_auth,
  cover_img,
  localFile,
  devFFmpeg,
  prodFFmpeg,
}: {
  live_room_id: number;
  user_id: number;
  name: string;
  desc: string;
  cdn: LiveRoomUseCDNEnum;
  weight: number;
  pull_is_should_auth: LiveRoomPullIsShouldAuthEnum;
  cover_img: string;
  localFile: string;
  devFFmpeg: boolean;
  prodFFmpeg: boolean;
}) {
  let flv_url = '';
  let hls_url = '';
  let rtmp_url = '';
  let webrtc_url = '';
  let push_rtmp_url = '';
  let push_obs_server = '';
  let push_obs_stream_key = '';
  let push_webrtc_url = '';
  let push_srt_url = '';
  async function main() {
    await liveService.deleteByLiveRoomId(live_room_id);
    // 开发环境时判断devFFmpeg，是true的才初始化ffmpeg
    // 生产环境时判断prodFFmpeg，是true的才初始化ffmpeg
    if (
      (PROJECT_ENV === PROJECT_ENV_ENUM.development && devFFmpeg) ||
      (PROJECT_ENV === PROJECT_ENV_ENUM.prod && prodFFmpeg)
    ) {
      // const ffmpegCmd = spawn(`ffmpeg`, [
      //   '-loglevel', // -loglevel quiet不输出log
      //   'quiet',
      //   '-readrate', // 以本地帧频读数据，主要用于模拟捕获设备
      //   '1',
      //   '-stream_loop', // 设置输入流应循环的次数。Loop 0表示无循环，loop-1表示无限循环。
      //   '-1',
      //   '-i', // 输入
      //   localFile,
      //   '-vcodec', // 只拷贝视频部分，不做编解码。
      //   'copy',
      //   '-acodec', // / 只拷贝音频部分，不做编解码。
      //   'copy',
      //   '-f', // 强制输入或输出文件格式。通常会自动检测输入文件的格式，并根据输出文件的文件扩展名猜测格式，因此在大多数情况下不需要此选项。
      //   'flv',
      //   rtmp_url,
      // ]);
      // const { pid } = ffmpegCmd;
      // console.log(chalkWARN('ffmpeg进程pid'), pid);
      const ffmpegCmd = `ffmpeg -loglevel quiet -readrate 1 -stream_loop -1 -i ${localFile} -vcodec copy -acodec copy -f flv '${push_rtmp_url}'`;
      // const ffmpegSyncCmd = `${ffmpegCmd} 1>/dev/null 2>&1 &`;
      try {
        // WARN 使用execSync的话，命令最后需要添加：1>/dev/null 2>&1 &，否则会自动退出进程；
        // 但是本地开发环境的时候，因为nodemon的缘故，每次热更新后，在ffmpeg推完流后，触发on_unpublish钩子，删除了live表里的直播记录
        // 实际上本地还在推流，但是on_unpublish钩子删了live表里的直播记录，不合理。
        // execSync(ffmpegSyncCmd);
        // TIP 使用exec，这样命令后面不需要添加：1>/dev/null 2>&1 &，这样每次热更都会重新推流，而且不会触发on_unpublish钩子
        exec(ffmpegCmd);
        console.log(
          chalkSUCCESS(`FFmpeg推流成功！roomId：${live_room_id}`),
          ffmpegCmd.replace(' -loglevel quiet', '')
        );
      } catch (error) {
        console.log(chalkERROR(`FFmpeg推流错误！`), error);
      }
    }
    await liveRoomService.update({
      id: live_room_id,
      name,
      desc,
      cdn,
      pull_is_should_auth,
      weight,
      cover_img,
      rtmp_url,
      flv_url,
      hls_url,
      webrtc_url,
      push_rtmp_url,
      push_obs_server,
      push_obs_stream_key,
      push_webrtc_url,
      push_srt_url,
      type: LiveRoomTypeEnum.system,
    });
  }

  if (
    PROJECT_ENV === PROJECT_ENV_ENUM.prod &&
    prodFFmpeg &&
    cdn === LiveRoomUseCDNEnum.yes
  ) {
    await tencentcloudUtils.dropLiveStream({
      roomId: live_room_id,
    });
    const { res, err } = await tencentcloudUtils.queryLiveStream({
      roomId: live_room_id,
    });
    if (err) return;
    if (res) {
      const pushRes = tencentcloudUtils.getPushUrl({
        roomId: live_room_id,
      });
      push_rtmp_url = pushRes.push_rtmp_url;
      push_obs_server = pushRes.push_obs_server;
      push_obs_stream_key = pushRes.push_obs_stream_key;
      push_webrtc_url = pushRes.push_webrtc_url;
      push_srt_url = pushRes.push_srt_url;
      const pullUrlRes = tencentcloudUtils.getPullUrl({
        roomId: live_room_id,
      });
      rtmp_url = pullUrlRes.rtmp;
      flv_url = pullUrlRes.flv;
      hls_url = pullUrlRes.hls;
      webrtc_url = pullUrlRes.webrtc;
      await main();
      // 这个不能省，cdn不是推流到srs的，所以不能用不了srs的onpublish回调
      liveService.create({
        live_room_id,
        user_id,
        socket_id: '-1',
        track_audio: 1,
        track_video: 1,
      });
    }
  }

  if (cdn === LiveRoomUseCDNEnum.no) {
    const liveRoomInfo = await liveRoomService.findKey(live_room_id);
    const key = liveRoomInfo?.key;
    if (key) {
      const pushRes = srsController.common.getPushUrl({
        liveRoomId: live_room_id,
        type: LiveRoomTypeEnum.system,
        key,
      });
      push_rtmp_url = pushRes.push_rtmp_url;
      push_obs_server = pushRes.push_obs_server;
      push_obs_stream_key = pushRes.push_obs_stream_key;
      push_webrtc_url = pushRes.push_webrtc_url;
      push_srt_url = pushRes.push_srt_url;
      const pullRes = srsController.common.getPullUrl(live_room_id);
      rtmp_url = pullRes.rtmp;
      flv_url = pullRes.flv;
      hls_url = pullRes.hls;
      webrtc_url = pullRes.webrtc;
      await main();
    }
  }
}

export const initFFmpeg = async (init = true) => {
  if (!init) return;
  // 开发环境的nodemon热更新会导致每次重启后执行initFFmpeg重新推流，但是重启node进程会导致之前的initFFmpeg子进程断掉，也就是会断开推流，导致触发on_publish。
  // 因为断开流的on_publish有延迟，所以重启后执行initFFmpeg了，触发onpublish了，过一会才收到了之前的on_publish，导致出问题（on_publish里会删掉数据库live表的记录）
  // 因此干脆重启一下srs容器？但重启太耗性能了，搞个延迟执行临时解决下先
  // if (PROJECT_ENV === PROJECT_ENV_ENUM.development) {
  //   setTimeout(() => {
  //     console.log(chalkWARN('两秒后初始化FFmpeg推流'));
  //   }, 500);
  //   // execSync(`docker restart ${SRS_CONFIG.docker.container}`);
  //   // await asyncUpdate(() => {
  //   //   console.log();
  //   // }, 2000);
  // }
  const flag = ffmpegIsInstalled();
  if (flag) {
    console.log(chalkWARN('ffmpeg已安装，开始运行ffmpeg推流'));
  } else {
    console.log(chalkERROR('未安装ffmpeg！'));
    return;
  }
  try {
    // 踢掉所有直播
    const res = await srsController.common.getApiV1Clients({
      start: 0,
      count: 9999,
    });
    const oldClientsQueue: any[] = [];
    res.clients.forEach((item) => {
      oldClientsQueue.push(srsController.common.deleteApiV1Clients(item.id));
    });
    await Promise.all(oldClientsQueue);
    const queue: any[] = [];
    Object.keys(initUser).forEach((item) => {
      queue.push(
        addLive({
          live_room_id: initUser[item].live_room.id!,
          user_id: initUser[item].id!,
          name: initUser[item].live_room.name!,
          desc: initUser[item].live_room.desc!,
          cdn: initUser[item].live_room.cdn!,
          weight: initUser[item].live_room.weight!,
          pull_is_should_auth: initUser[item].live_room.pull_is_should_auth!,
          cover_img: initUser[item].live_room.cover_img!,
          localFile: initUser[item].live_room.localFile,
          devFFmpeg: initUser[item].live_room.devFFmpeg,
          prodFFmpeg: initUser[item].live_room.prodFFmpeg,
        })
      );
    });
    await Promise.all(queue);
    console.log(chalkSUCCESS(`初始化FFmpeg推流成功！`));

    // const child = exec(ffmpeg, (error, stdout, stderr) => {
    //   console.log(
    //     chalkSUCCESS(`初始化FFmpeg成功！`)
    //   );
    //   console.log('error', error);
    //   console.log('stdout', stdout);
    //   console.log('stderr', stderr);
    // });
    // child.on('exit', () => {
    //   console.log(
    //     chalkINFO(`initFFmpeg子进程退出了`)
    //   );
    // });
    // child.on('error', () => {
    //   console.log(
    //     chalkINFO(`initFFmpeg子进程错误`)
    //   );
    // });
  } catch (error) {
    console.log(chalkERROR(`初始化FFmpeg推流错误！`));
    console.log(error);
  }
};
