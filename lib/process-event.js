'use strict';

var when = require('when');

/**
 * Processes an inbound Webex event.
 * This can be called by either the webhook or websocket handler.
 * @function
 * @private
 * @param {Object} framework - The framework object this function applies to.
 * @param {Object} body - The body of the event being processed
 * @param {String} name - The name of the webhook, if a webhook is being processed
 */
function processEvent(framework, body, name = '') {
  if (!framework.active) {
    return when(true);
  }

  // get event content
  var name = name ? name : body.name;
  var resource = body.resource;
  var event = body.event;
  var data = body.data;
  var actorId = body.actorId;
  var roomId = body.filter ? body.filter.split('=')[1] : null;

  // validate event is bound for this instance of framework
  if (name !== framework.webhook.name || (typeof framework.webhook.roomId !== 'undefined' && framework.webhook.roomId !== roomId)) {
    return when(true);
  }

  if (typeof resource !== 'string' || typeof event !== 'string') {
    framework.debug('Can not determine webhook type');
    return when(true);
  }

  // rooms
  if (resource === 'rooms') {
    return framework.webex.rooms.get(data.id)
      .then(room => {

        // set room title for rooms with none set (api bug?)
        if (room.title == '') {
          room.title = 'Default title';
        }

        // room created
        if (event === 'created') {
          framework.myEmit('roomCreated', room);

          return framework.onRoomCreated(room)
            .catch(err => {
              framework.debug(err.stack);
              return when(true);
            });
        }

        // room updated
        if (event === 'updated') {
          framework.myEmit('roomUpdated', room);

          return framework.onRoomUpdated(room)
            .catch(err => {
              framework.debug(err.stack);
              return when(true);
            });
        }

      })
      .catch(() => {
        return when(true);
      });
  }

  // memberships
  if (resource === 'memberships') {

    // membership created
    if (event === 'created') {
      return framework.webex.memberships.get(data.id)
        .then(membership => {
          framework.myEmit('membershipCreated', membership);

          return framework.onMembershipCreated(membership, actorId)
            .catch(err => {
              framework.debug(err.stack);
              return when(true);
            });
        })
        .catch(() => {
          return when(true);
        });
    }

    // membership updated
    if (event === 'updated') {
      return framework.webex.memberships.get(data.id)
        .then(membership => {
          framework.myEmit('membershipUpdated', membership);

          return framework.onMembershipUpdated(membership)
            .catch(err => {
              framework.debug(err.stack);
              return when(true);
            });
        })
        .catch(() => {
          return when(true);
        });
    }

    // membership deleted
    if (event === 'deleted') {
      framework.myEmit('membershipDeleted', data);

      return framework.onMembershipDeleted(data, actorId)
        .catch(err => {
          framework.debug(err.stack);
          return when(true);
        });
    }

  }

  // messages
  if (resource === 'messages') {
    // message created
    if (event === 'created') {
      return framework.webex.messages.get(data.id)
        .then(message => {
          framework.myEmit('messageCreated', message);
          // check if message is from bot...
          if (message.personId === framework.person.id) {
            // ignore messages from bot
            this.debug(`Ignoring message "${message.text}" in room ID: ${message.roomId} from bot.`);
            return when(true);
          }


          // profile framework/app message processing speed
          const start = Date.now();
          return framework.onMessageCreated(message)
            .then(() => {
              if (framework.options.profileMsgProcessingTime) {
                const msgProcessTime = Date.now() - start;
                console.log(`Framework+App message processing time: ${msgProcessTime} msecs`);
                framework.numMessages += 1;
                framework.cumMsgProcessTime += msgProcessTime;
              }            
            })
            .catch(err => {
              framework.debug(err.stack);
              return when(true);
            });
        })
        .catch(() => {
          return when(true);
        });
    }

    // message deleted
    if (event === 'deleted') {
      framework.myEmit('messageDeleted', data);
      return when(true);
    }
  }

  // Buttons & Cards Attachment Actions
  if (resource === 'attachmentActions') {
    // action created
    if (event === 'created') {
      return framework.webex.attachmentActions.get(data.id)
        .then(attachmentAction => {
          // We'll emit an event later if we detect a related bot
          return framework.onAttachmentActions(attachmentAction)
            .catch(err => {
              framework.debug(err.stack);
              return when(true);
            });
        })
        .catch((e) => {
          console.error(`attachmentAction generated error: ${e.massage}`);
          return when(true);
        });
    }
  }

}

module.exports = processEvent;
