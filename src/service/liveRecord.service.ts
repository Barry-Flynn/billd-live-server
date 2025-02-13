import { filterObj, isPureNumber } from 'billd-utils';
import { Op, literal } from 'sequelize';

import { IList, ILiveRecord } from '@/interface';
import areaModel from '@/model/area.model';
import liveRecordModel from '@/model/liveRecord.model';
import liveRoomModel from '@/model/liveRoom.model';
import userModel from '@/model/user.model';
import { handlePaging } from '@/utils';

class LivePlayService {
  /** 直播记录是否存在 */
  async isExist(ids: number[]) {
    const res = await liveRecordModel.count({
      where: {
        id: {
          [Op.in]: ids,
        },
      },
    });
    return res === ids.length;
  }

  /** 获取直播记录列表 */
  async getList({
    id,
    client_id,
    live_room_id,
    user_id,
    orderBy,
    orderName,
    nowPage,
    pageSize,
    keyWord,
    rangTimeType,
    rangTimeStart,
    rangTimeEnd,
  }: IList<ILiveRecord>) {
    let offset;
    let limit;
    if (nowPage && pageSize) {
      offset = (+nowPage - 1) * +pageSize;
      limit = +pageSize;
    }
    const allWhere: any = {};
    if (id !== undefined && isPureNumber(`${id}`)) {
      allWhere.id = id;
    }
    if (client_id !== undefined && isPureNumber(`${client_id}`)) {
      allWhere.client_id = client_id;
    }
    if (live_room_id !== undefined && isPureNumber(`${live_room_id}`)) {
      allWhere.live_room_id = live_room_id;
    }
    if (user_id !== undefined && isPureNumber(`${user_id}`)) {
      allWhere.user_id = user_id;
    }
    if (keyWord) {
      const keyWordWhere = [];
      allWhere[Op.or] = keyWordWhere;
    }
    if (rangTimeType) {
      allWhere[rangTimeType] = {
        [Op.gt]: new Date(+rangTimeStart!),
        [Op.lt]: new Date(+rangTimeEnd!),
      };
    }
    const orderRes: any[] = [];
    if (orderName && orderBy) {
      orderRes.push([orderName, orderBy]);
    }
    const result = await liveRecordModel.findAndCountAll({
      include: [
        {
          model: userModel,
          attributes: {
            exclude: ['password', 'token'],
          },
        },
        {
          model: liveRoomModel,
          attributes: {
            exclude: [
              'key',
              'push_rtmp_url',
              'push_obs_server',
              'push_obs_stream_key',
              'push_webrtc_url',
              'push_srt_url',
            ],
          },
          include: [
            {
              model: areaModel,
              through: {
                attributes: [],
              },
            },
          ],
        },
      ],
      attributes: {
        exclude: [
          'key',
          'push_rtmp_url',
          'push_obs_server',
          'push_obs_stream_key',
          'push_webrtc_url',
          'push_srt_url',
        ],
        include: [
          [
            literal(
              `(select weight from ${liveRoomModel.tableName}
                where ${liveRoomModel.tableName}.id = ${liveRecordModel.tableName}.live_room_id)`
            ),
            'live_room_weight',
          ],
        ],
      },
      order: [[literal('live_room_weight'), 'desc'], ...orderRes],
      limit,
      offset,
      where: {
        ...allWhere,
      },
    });
    return handlePaging<ILiveRecord>(result, nowPage, pageSize);
  }

  /** 查找直播记录 */
  async find(id: number) {
    const result = await liveRecordModel.findOne({ where: { id } });
    return result;
  }

  /** 修改直播记录 */
  async update(data: ILiveRecord) {
    const { id } = data;
    const data2 = filterObj(data, ['id']);
    const result = await liveRecordModel.update(data2, { where: { id } });
    return result;
  }

  /** 修改直播记录 */
  async updateView({ live_room_id }: ILiveRecord) {
    const lastData = await liveRecordModel.findOne({
      order: [['created_at', 'desc']],
      where: { live_room_id, end_time: { [Op.not]: true } },
    });
    let flag = true;
    if (lastData) {
      await liveRecordModel.update(
        { view: literal('`view` +1') },
        {
          where: { id: lastData.id },
        }
      );
    } else {
      flag = false;
    }
    return flag;
  }

  /** 修改直播记录 */
  async updateDanmu({ live_room_id }: ILiveRecord) {
    const lastData = await liveRecordModel.findOne({
      order: [['created_at', 'desc']],
      where: { live_room_id, end_time: { [Op.not]: true } },
    });
    let flag = true;
    if (lastData) {
      await liveRecordModel.update(
        { view: literal('`danmu` +1') },
        {
          where: { id: lastData.id },
        }
      );
    } else {
      flag = false;
    }
    return flag;
  }

  /** 修改直播记录 */
  async updateByLiveRoomIdAndUserId({
    client_id,
    live_room_id,
    user_id,
    danmu,
    duration,
    view,
    end_time,
  }: ILiveRecord) {
    const result = await liveRecordModel.update(
      {
        danmu,
        duration,
        view,
        end_time,
      },
      { where: { client_id, live_room_id, user_id } }
    );
    return result;
  }

  /** 创建直播记录 */
  async create(data: ILiveRecord) {
    const result = await liveRecordModel.create(data);
    return result;
  }

  /** 删除直播记录 */
  deleteByLiveRoomIdAndUserId = async (data: {
    client_id: number;
    live_room_id: number;
    user_id: number;
  }) => {
    const res = await liveRecordModel.destroy({
      where: {
        client_id: data.client_id,
        live_room_id: data.live_room_id,
        user_id: data.user_id,
      },
    });
    return res;
  };

  /** 删除直播记录 */
  async delete(id: number) {
    const result = await liveRecordModel.destroy({
      where: { id },
      individualHooks: true,
    });
    return result;
  }
}

export default new LivePlayService();
