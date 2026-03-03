2.2 Profile 1 – Basic Object Workflow
This profile allows a Media Object Server to push messages, which represent objects contained on the Media Object Server, to other machines.

 

In addition to support for Profile 0, these additional messages are required for support of Profile 1:

 

 

            mosAck

            mosObj

            mosReqObj

            mosReqAll

            mosListAll

 

 

 

General Work Flow for Profile 1

 

·        Media Object Servers push <mosObj> messages describing media to the NCS.   This description includes a pointer to the media object as well as descriptive metadata.

 

·        The NCS exposes <mosObj> information to users through lists, searches or other mechanisms in such a way that pointers representing the media objects are able to be moved or copied into stories as Item References.  Item References are derived from <mosObj> information.

 

·        Optionally, an ActiveX control, provided by the Media Object Server Vendor, can be instantiated within the NCS UI.  This ActiveX control has the ability to form an Item Reference and pass it to the NCS for integration as an Item Reference into a Story. (See the MOS v2.8.4 ActiveX Specification)

 

·       Optionally, activating a pointer within the NCS (for example: in a list, embedded in a Story, etc.) instantiates an ActiveX control, provided by the Media Object Server Vendor, within the NCS UI.  This ActiveX control provides, at a minimum, the ability to browse or display a proxy version of an object and also facilitates the integration of that object into an NCS Story as an Item Reference. (See the MOS v2.8.4 ActiveX Specification)

 


·        The only MOS External Metadata (MEM) blocks that can be carried from the mosObj to the Item Reference are those with a <mosScope> of either "STORY" or "PLAYLIST".

 

 

Implementation Notes:

 

<mosObj> messages are sent from the Media Object Server to other applications to make them aware of objects stored on the Media Object Server.

 

Recommended Work Practice:  Other machines can populate their own database structures from the data contained within the <mosObj> messages they receive.  It is possible then for these other applications to maintain a synchronized metadatabase describing objects contained within the Media Object Server. 

 

Other NCS applications have the opportunity to store and update a local metadatabase with this information.  These applications can then perform searches on the local metadatabase and retrieve pointers to objects stored on the Media Object Server with matching records.  These objects can then be referred to by unique <objID> without the immediate need to copy or move the essence of the object from the Media Object Server to the other applications.

 

Object Creation and Notification

 

When an object is created on a Media Object Server a <mosObj> message is pushed from the Media Object Server to a target application configured to receive this information.  The initial <mosObj> message will have a <status> value of "NEW".

 

As metadata associated with an object stored on the Media Object Server changes, the Media Object Server needs to update the metadata already sent to other applications where it has been stored locally.  Subsequent <mosObj> messages with updated metadata are sent from the Media Object Server with a <status> value of "UPDATED".

 

In regards to the <mosObj> "UPDATED" message; if metadata tags exist in the target MOS Object and are not present in the <mosObj> "UPDATED" message, the metadata tags in the target Item Reference should be left intact.

 

Also, if the intention is to remove a tag from the target MOS Object, it should be included in the <mosObj> "UPDATED" message with a null value.

 

When the object is deleted from the Media Object Server or when the Media Object Server determines the object no longer has relevance to other devices, the Media Object Server sends a final <mosObj> message with a <status> of "DELETED".

 

Recommended Work Practice: In many implementations both the target NCS and MOS sender need to have prior knowledge of each other stored in local configurations before messages can be meaningfully exchanged.

 

 It is possible, and sometimes desirable, to limit the number and type of objects which are pushed from the Media Object Server to other applications so that other applications are aware of only a subset of the entire population of objects stored on the Media Object Server.

 

Care should be taken to avoid unnecessary <mosObj> updates. 

 

For instance, if an object is being ingested or recorded by a media server the duration of that object could be expected to be constantly changing as the recording continues.  It is not reasonable to assume that other systems will want to receive updates every 1/10th of a second, every second, or even every few seconds when the recording is in progress.  Such frequent updates, in most systems, would not be useful and would only serve to consume network, disk I/O and CPU bandwidth. 

 

<mosObj> updates will be sent only at a frequency which is useful.  There may be exceptions to this general rule and thus the protocol does not specifically define a maximum or minimum update frequency.

 

 

Object IDs Must Be Unique

 

<objID>s are absolutely unique within the scope of the Media Object Server and are used to unambiguously reference media stored on a specific server.  The combination of <mosID> and <objID> will serve as a unique reference to an object on a specific server within an enterprise or multi-Media Object Server environment.  The <objID> associated with an object will never change.  Even if an object is moved from online, to nearline, to offline storage it will still use the same <objID> for unambiguous reference.

 

Applications should never, ever allow a user to enter or type an <objID>.  Users should be presented with indirect methods, such as lists, drop downs, drag and drop operations, etc. to choose and manipulate objects and object pointers.

 


Object Slugs are intended for display and use by Users

 

<objSlug>s are the non-unique, human readable analog to the unique, machine assigned <objID>. 

 

In short, <objSlug>’s are for humans.  <objID>’s are for machines.

 

 <objSlug>s can optionally be assigned or changed as necessary by users. <objID>s can never be assigned or modified by users directly.

 

Recommended Work Practice:  Display the <objSlug> to users and hide the <objID>.

 

The <objSlug> field will contain the primary one line reference or name for an object exposed to users.  This field is limited to 128 characters.

 

Abstracts and Descriptions may contain more information

 

The <mosAbstract> can contain a somewhat longer, but still brief, description of summary of the object which many applications may choose to alternately display.

 

The <description> will contain a verbose description of the object with information necessary to find the object via search functions.

 

MEM blocks carry Metadata Payloads

 

The <mosExternalMetadata> block (aka MOS MEM) is intended to be the mechanisms through which full and verbose descriptions of objects can be carried, which include the use of non-MOS schemas and tags for fielded data. 

 

The MEM is the mechanism by which MOS supports Metadata Schema Standards such as NewsML, SMEF, SMPTE, MPEG7 and user specific schemas.  MEM data blocks are not directly manipulated by the MOS Protocol and can be considered an information Payload which is carried between systems by the MOS Protocol.

 

Because MEM blocks can potentially carry large volumes of information, and because this information may not be relevant to all aspects of MOS applications, it makes sense to specifically state the scope of processes to which this information may be relevant.  Thus, MEM blocks need only be carried as far into the process as is needed, and not unnecessarily consume network bandwidth, CPU or storage.

 

The <mosScope> tag describes to what extent within an NCS type workflow the MEM block will be carried. 

 

A value of "OBJECT" implies that the MEM payload will be used for list and search purposes, but will not necessarily be carried into Stories or Play Lists/Content Lists. 

 

A value of "STORY" implies the MEM payload will be used like the "OBJECT" case, but will be further carried into MOS Item References embedded in Stories.  However, MEM Payloads with a <mosScope> of "STORY" are not carried into Play Lists/Content Lists.

 

A value of "PLAYLIST" implies the MEM payload will be used and included in all aspects of the production workflow, including embedding this information in the Item Reference in the Story and in Item References contained in the PlayList.

 

 

 

Exchanging Messages between MOS devices

 

To send a <mosObj> message from MOS to NCS: 

 

1)     The MOS device will open a socket on the lower port to the NCS if it is not already open

 

2)     The MOS device will send the mosObj message

 

3)     The MOS device will hold the socket open

 

4)     The MOS device will wait for a mosAck message to be returned on the same socket before either dropping the socket or transmitting the next message.

 

5)     The MOS device can optionally send <heartbeat> messages at regular intervals to the remote machine and look for a response.

 

Recommended Work Practice: It is not necessary to disconnect the socket once the ACK has been received.  It may be more efficient and require less overhead to simply leave the socket open until the next message is transmitted, even if this is not immediate.  If the socket is dropped the application should re-establish the socket before the next message is transmitted.

 

Important Application Note:  When a socket is closed, either locally or remotely, care should be taken to ensure the socket is  completely disconnected.  This is a 4 step process involving communication between both machines.  It is normally taken care of at a level below application development.  However, if problems are experienced establishing a socket between machines after at least one socket connection has been established and then dropped, this may be a sign the first socket was not properly closed.  Check the status of all network connections on both machines. A socket status of  "FIN_WAIT_2" or "CLOSE_WAIT" on ports used for MOS communications indicates that there may be a problem.

 

MOS message flow is strictly sequential

 

The Media Object Server will not send the next lower port message until the last message is acknowledged. 

 

Flow of message traffic on the upper port is unrelated to acknowledgements on the lower port and vice versa.

 

If the value of <status> in the mosAck message is "NACK" then a more verbose error message is contained in <statusDescription>.

 

Data ownership and Synchronization

 

Metadata sent from the Media Object Server, including descriptions, pointers and MEM blocks, cannot be changed by the NCS device.  No mechanisms exist to reflect such changes back into the Media Object Server.  Such an operation would be conceptually incompatible with the MOS Protocol.There is one exception: MOS metadata that was created by the NCS can be modified by the NCS. The <mosReqObjAction> message provides this capability.

 

Users at an NCS workstation can change MOS related data via an ActiveX control should one be provided by the Media Object Server vendor.  The ActiveX can be instantiated within the NCS UI and provide the ability to edit, create, and delete MOS data.  This method is permitted since the vendor’s ActiveX control, not the NCS,  modifies the object information.

 

There may be times when an application may wish for the Media Object Server to send a full list of objects and descriptions.  This may happen on initial installation and integration of systems, or at any other time when an NCS device wishes to synchronize its <mosObj> metadatabase from the Media Object Server.  The <mosReqAll> and <mosListAll> messages are designed to facilitate this.  There are methods enabled by these messages.

 

Method 1:

 

1.      NCS sends a <mosReqAll> with a <pause> value of "0"

 

2.      MOS replies with a <mosAck>, and then sends a series of <mosObj> messages encapsulated within a single <mosListAll> tag.

 

The first method enables the receiving NCS device to detect the start and end of the synchronization sequence.  It can also potentially consume large amounts of network, CPU and disk I/O bandwidth.

 

Method 2:

 

1.      NCS sends a <mosReqAll> with a <pause> value greater than zero.

 

2.      MOS replies with a <mosAck>, and then sends a series of individual <mosObj> messages.

 

The value of <pause> indicates the number of seconds the MOS will  pause in between <mosObj> messages intended for synchronization.

 

Other <mosObj> messages can be transmitted by the MOS between and concurrent with <mosObj> messages created as a result of the <mosReqAll> request.  For instance, new objects, updates and deletions caused by workflow interaction.

 

The second method is advantageous as it has less impact on MOS and NCS resource bandwidth, but there is no differentiation of <mosObj> messages intended for synchronization as opposed to those generated as a result of normal work flow.

 

The <mosReqObj> message is rarely used in actual operation but must be supported so that it can be used as a diagnostic tool..


4.1.4 mosExternalMetadata – External Metadata
Purpose
The mosExternalMetadata block can appear in several messages as a mechanism for transporting additional metadata, independent of schema or DTD.

Behavior
The value of the <mosScope> tag implies through what production processes the mosExternalMetadata information will travel.

 

A scope of "OBJECT" implies this information is generally descriptive of the object and appropriate for queries.

 

A scope of "STORY" suggests this information may determine how the Object is used in a Story.  For instance, Intellectual Property Management.  This information will be stored and used with the Story.

 

A scope of "PLAYLIST" suggests this information is specific to describing how the Object is to be published, rendered, or played to air and thus, will be included in the Playlist in addition to the Story.

 

This mechanism allows devices to roughly filter external metadata and selectively apply it to different production processes and outputs.  Specifically, it is neither advisable nor appropriate to send large amounts of inappropriate metadata to the Playlist in roCreate messages. In addition to these blocks of data being potentially very large, the Media Object Server is, presumably, already aware of this data.

 

The value of the <mosSchema> tag will be descriptive of the schema used within the <mosPayload>.  The value of <mosSchema> is implied to be a pointer or URL to the actual schema document.

 

The contents of <mosPayload> must be well formed XML, regardless of the schema used.


Structural Outline
mosExternalMetadata
    mosScope?   

    mosSchema

    mosPayload                       

Syntax
<!ELEMENT mosExternalMetadata (mosScope?, mosSchema, mosPayload>

 

Note: The value of mosSchema is recommended to be a URL – the rightmost element of which is considered significant and uniquely identifying for the purposes of validation

 

Example
<mosExternalMetadata>

    <mosScope>STORY</mosScope>

     <mosSchema>http://ncsA4.com/mos/supported_schemas/NCSAXML2.08</mosSchema>

    <mosPayload>

      <Owner>SHOLMES</Owner>

      <ModTime>20010308142001</ModTime>

      <mediaTime>0</mediaTime>

      <TextTime>278</TextTime>

      <ModBy>LJOHNSTON</ModBy>

      <Approved>0</Approved>

      <Creator>SHOLMES</Creator>

</mosPayload>
</mosExternalMetadata>